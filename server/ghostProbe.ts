// The uploads step's live check (0.8.0 U2 M2; REQ-BFG-016, REQ-BFG-009), a port of 0.7.0 U1's probe (cap_gamma, uploads-070
// d145bc5) to bb-0.8.0, and since BELTS (REQ-BFG-043, REQ-BFG-044) to bb-0.8.3: the same four heroes and the same checks,
// under the rules string BELTS ships (belt slots by level and the hero's two gold upgrades change which decks are legal,
// not who may travel). It does what a player's page does, from outside, against a base URL. It makes a fresh device
// identity with the game's own identity and signing code (src/net/identity.ts loadIdentity over an in-memory key store:
// the private key is generated non-extractable and never leaves this process). Each POST /v1/ghosts sends the canonical
// bytes the game's submitGhost sends (encodeSnapshot), signed with identity.sign. The checks, in order:
//   furnace-signed      the FURNACE start deck, day 1, 0 wins, 5 lives                         -> 201 and its ghost id
//   furnace-unsigned    the same bytes, without x-bb-key and x-bb-sig                          -> 401
//   dishonest-signed    that deck with 1000 more hull than day 1's budget pays for             -> 422, validateUpload's budget error
//   unreachable-signed  that honest deck with a record no run carries: day 1, 0 wins, 1 life   -> 422, H2's record error
//   hero-WEAVER, hero-FOUNDRY, hero-BASTION: each hero's honest day-3 reference deck (heroRefBuild) at 1 win and 5 lives,
//                       a record a run carries into dusk 3 (records.ts isReachable)            -> 201 each
//   hero-METRONOME, hero-SIPHON: the same, for the two heroes bb-0.10.0 does not take (FLIP-X2: release X adds no hero; BAL-2: nor does 0.9.1; Y7b2: nor does release Y; Z-BUMP: nor does release Z; AZ-BUMP: nor does the hull release). The game's encoder
//                       refuses them, so their bytes are the canonical text built by hand     -> 400, the strict decode's
//                       hero gate naming bb-0.8.3 and the hero
// Z-PREP (REQ-BFG-073; LC-1 REPORT 9.3), two more rows, under PROBE_RULES with LAST CHANCE (Z-BUMP: the switch is gone;
// the rules gate decides, rulesGate.ts lastChanceGateProblem(PROBE_RULES), as for any record):
//   lastchance-signed   FURNACE's start deck with its six dawn runes and the HULL card (+LAST_CHANCE_HULL), dusk 6 at 0 wins
//                       and 2 lives after a LAST CHANCE on day 5, with its seed                -> 201 and its ghost id
//   lastchance-day3     the same with its LAST CHANCE on day 3, which no run carries           -> 422, the record error
// Under rules before LAST_CHANCE_RULES the plan would be exactly the nine rows above, in that order, byte for byte.
// AZ-BUMP (REQ-BFG-077, REQ-BFG-078; the hull release's bump to bb-0.10.0), two more rows, under PROBE_RULES with the NPC
// day (the rules gate decides, rulesGate.ts npcDayGateProblem(PROBE_RULES), as for any record):
//   npcday-signed       WEAVER's start deck with its two dawn runes, dusk 2 at 1 win and 5 lives, with its seed and the
//                       road log of its two warlord wins (day 1 EASY, no drop; day 2 MEDIUM, its seeded drop SCATTER)
//                                                                                              -> 201 and its ghost id
//   npcday-forged       the same with day 2's drop forged (DARTGUN, another part of that warlord's pool)
//                                                                                              -> 422, the road error
// Under rules before NPC_DAY_RULES the plan would be exactly the eleven rows above, in that order, byte for byte.
// HULL-ON (REQ-BFG-096; the flip, HEARTS; cap's ruling 12a42239093fb6ec, Q2): the probe writes its records under
// PROBE_RULES, and the server judges each by the rules gate heartsFor(PROBE_RULES) (records.ts: the hearts model, runs start
// at HEARTS_START), so every row's lives go through that gate (probeHasHearts) and come from the hearts rule, never typed:
// the honest, dishonest, hero and NPC-day rows hold a run's start (HEARTS_START: 10 hearts), the unreachable row stays
// day 1 at 1 (no run holds less than its start at dusk 1, on either scale) and is refused with the server's own message,
// and the LAST CHANCE rows sit at the first dusk after LAST CHANCE fires on a run that loses every dusk, stepped with
// heartsDusk until heartsLastChanceFires (day 6: 9 8 7 5 3, then 1), so dusk 7 at 0 wins and 1 heart (probeLastChance).
// Under rules without hearts (heartsFor false) the rows are the 5-lives rows above, as before.
// Exactly six decks are stored, each its own record under the probe's player: FURNACE, WEAVER, FOUNDRY, BASTION,
// FURNACE's LAST CHANCE deck and WEAVER's NPC-day deck (five under rules without the NPC day, four without LAST CHANCE).
// Built by `npm run build:server` beside ghost-admin.mjs:  node server/dist/ghost-probe.mjs <base-url> <id-file>
// It writes the probe's player id to <id-file> before the first POST, so the clean-up (ghost-admin.mjs remove-player)
// always has it, and it refuses an <id-file> that already holds an id (that earlier probe's player is not cleaned up yet).
// It prints one line per check (PASS or FAIL, name, expected, got), then the player id, then a summary with the number of
// decks the server stored for this player. Exit 0 only if every check matched; 1 if a check failed or got no answer; 2
// for a usage error (nothing sent). It refuses to run unless this build's RULES_VERSION is bb-0.10.0. There is no secret
// to print: the key is non-extractable, and neither the public key nor a signature is printed. No network but the base
// URL. Its expectations are written out here, not read from the code under test (the rules gate, the record model).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { KEY_HEADER, SIG_HEADER, loadIdentity, memoryKeyStore } from "../src/net/identity";
import { checkBuildShape, encodeSnapshot, ghostId, SNAPSHOT_V3, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { botTakeRune } from "../src/sim/runes"; // FLIP-X2 (cap's ruling 5d6d83ef57d1494c): the honest decks' dawn runes
import { LAST_CHANCE_HULL } from "../src/sim/lastChance"; // Z-PREP (REQ-BFG-073): the flip's two rows
import { lastChanceGateProblem } from "../src/net/rulesGate"; // Z-BUMP (REQ-BFG-073): the two rows by PROBE_RULES, through the rules gate
import { npcDayGateProblem } from "../src/net/rulesGate"; // AZ-BUMP (REQ-BFG-077, REQ-BFG-078): the NPC day's two rows, through the rules gate
import type { RoadEntry } from "../src/sim/npcDay"; // AZ-BUMP: the NPC-day rows' road log
import { openRunesFor } from "../src/net/rulesGate"; // OPEN-1 (REQ-BFG-109): the honest decks' offer rule, by PROBE_RULES
// HULL-ON (REQ-BFG-096; cap's ruling 12a42239093fb6ec, Q2): the rows' lives by PROBE_RULES's hearts gate, from the hearts rule
import { heartsFor } from "../src/net/rulesGate";
import { HEARTS_START, heartsDusk, heartsLastChanceFires } from "../src/sim/hearts";
import { RUN_DAYS, START_LIVES } from "../src/sim/content";

/** The rules this probe's expectations are written for: the hull release's (bb-0.10.0, AZ-BUMP's bump, with the NPC day's
 *  two rows; release Z's bb-0.9.7 with LAST CHANCE's two rows, release Y's bb-0.9.3, BAL-2's bb-0.9.1, release X's
 *  bb-0.9.0, RUNES-1's bb-0.8.7, PACKS's bb-0.8.6, BELTS's bb-0.8.3 and 0.8.0's bb-0.8.0 before, the same heroes). */
export const PROBE_RULES = "bb-0.10.0"; // AZ-BUMP (REQ-BFG-077, REQ-BFG-078, REQ-BFG-079): the bump (was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0)
/** FLIP-X2 (cap's ruling 5d6d83ef57d1494c): under bb-0.9.0 an upload holds exactly one rune a dawn (validateUpload's
 *  player mode). The probe's honest decks take theirs as the bots do (runes.ts botTakeRune at each dawn on this run seed:
 *  the grants on the build, every pick in its dawn's offer), and the snapshot carries the seed (v3), so the server
 *  re-derives each offer. */
export const PROBE_SEED = 20261005;
/** `build` holding the bots' picks at the dawns of days 1..day on PROBE_SEED. */
export function probeRunes(build: GhostSnapshot["build"], day: number): GhostSnapshot["build"] {
  const b: GhostSnapshot["build"] = JSON.parse(JSON.stringify(build));
  for (let d = 1; d <= day; d++) {
    // OPEN-1 (REQ-BFG-109): the offers of the probe's own rules (openRunesFor), the rule the server checks them by
    if (!botTakeRune(b, PROBE_SEED, d, b.hero, true, false, 0, openRunesFor(PROBE_RULES))) throw new Error(`ghost-probe: no rune for ${b.hero} at the dawn of day ${d}`);
  }
  return b;
}
/** The heroes bb-0.10.0 takes, as its hero gate names them (rulesGate.ts RULES_HEROES), written out. */
export const PROBE_ACCEPTED = "FURNACE, WEAVER, FOUNDRY, BASTION";
/** After FURNACE: the heroes whose honest decks must be stored (201), then those bb-0.10.0 refuses (400), in posting order. */
export const STORED_HEROES: readonly HeroId[] = ["weaver", "foundry", "bastion"];
export const REFUSED_HEROES: readonly HeroId[] = ["metronome", "siphon"];
/** The hero rows' dusk: day 3 at 1 win and 5 lives, a record a run carries into dusk 3. HULL-ON (HEARTS): the rows before
 *  hearts; under rules with hearts the plan reads probeDusk(HERO_DUSK) (the start's hearts: a win and a draw). */
export const HERO_DUSK = { day: 3, wins: 1, lives: 5 } as const;
/** The unreachable row's dusk: day 1 with 1 life (every run starts day 1 with 5 lives). HULL-ON (HEARTS): on both scales:
 *  dusk 1 holds only a run's start (probeStartLives: 10 hearts, or 5 lives before hearts), never 1. */
export const UNREACHABLE_DUSK = { day: 1, wins: 0, lives: 1 } as const;
/** HULL-ON (REQ-BFG-096; the flip, HEARTS; cap's ruling 12a42239093fb6ec, Q2): do the probe's records read on hearts? The
 *  server judges a record under PROBE_RULES by the rules gate heartsFor(PROBE_RULES) (records.ts reachableRecords), so the
 *  probe asks the same gate (as OPEN-1's rows ask openRunesFor): false before HEARTS_RULES or with the switch off. */
export const probeHasHearts = (): boolean => heartsFor(PROBE_RULES);
/** HULL-ON (HEARTS): a run's lives at its start under the probe's rules: HEARTS_START with hearts, else START_LIVES (5). */
export const probeStartLives = (): number => (probeHasHearts() ? HEARTS_START : START_LIVES);
/** HULL-ON (HEARTS): a start-lives row's dusk (the honest, dishonest, hero and NPC-day rows: no heart lost, a run's
 *  start) under the probe's rules: `d` as written (5 lives) without hearts; with hearts, its lives are the start's. */
export const probeDusk = (d: { day: number; wins: number; lives: number }): { day: number; wins: number; lives: number } =>
  ({ ...d, lives: probeStartLives() });
/** The decks the probe stores when every check passes: FURNACE's and STORED_HEROES'. */
export const PROBE_STORED = 1 + STORED_HEROES.length;
/** Z-PREP (REQ-BFG-073): the LAST CHANCE rows' dusk (five losses: the early-loss refund lifts day 3, the loss at dusk 5
 *  leaves 1 life and LAST CHANCE gives one back), the honest row's LAST CHANCE day and the forged row's. */
export const LC_DUSK = { day: 6, wins: 0, lives: 2 } as const;
export const LC_DAY = 5;
/** HULL-ON (HEARTS): the forged row's LAST CHANCE day, before the earliest one on either scale (day 5 on 5 lives, day 6
 *  on hearts: probeLastChance), so no run carries it. */
export const LC_FORGED_DAY = 3;
/** HULL-ON (REQ-BFG-096; the flip, HEARTS; cap's ruling 12a42239093fb6ec, Q2): the LAST CHANCE rows' dusk and the honest
 *  row's LAST CHANCE day under the probe's rules. With hearts (probeHasHearts), derived from the hearts rule as the server's
 *  record model steps it (records.ts heartsRecords): a run that loses every dusk from day 1, from HEARTS_START, each loss
 *  heartsDusk's step, until the first loss on which heartsLastChanceFires (day 6: 9 8 7 5 3, then 1); its dusk is the next
 *  day's, at 0 wins and the hearts LAST CHANCE leaves (1). Without hearts: LC_DUSK and LC_DAY, as before. */
export function probeLastChance(): { dusk: { day: number; wins: number; lives: number }; day: number } {
  if (!probeHasHearts()) return { dusk: LC_DUSK, day: LC_DAY };
  let hearts = HEARTS_START;
  for (let d = 1; d < RUN_DAYS; d++) {
    const step = heartsDusk(hearts, d, "loss", false);
    if (heartsLastChanceFires(d, "loss", Math.max(0, hearts - step.cost), false)) return { dusk: { day: d + 1, wins: 0, lives: step.hearts }, day: d };
    hearts = step.hearts;
  }
  throw new Error("ghost-probe: LAST CHANCE never fires on the hearts rule before the run's last day");
}
/** Z-BUMP (REQ-BFG-073): does the probe's rules version have LAST CHANCE (the rules gate: PROBE_RULES at or after
 *  LAST_CHANCE_RULES)? The switch is gone; this asks what the switch asked. */
export const probeHasLastChance = (): boolean => lastChanceGateProblem(PROBE_RULES) === null;
/** AZ-BUMP (REQ-BFG-077, REQ-BFG-078): the NPC-day rows' hero, dusk and road log on PROBE_SEED, written out (the server
 *  re-derives each warlord, its deck and its seeded roll from the seed: validate.ts roadProblem). Day 1's EASY warlord
 *  (BRASSWICK) rolled no drop; day 2's MEDIUM warlord (LACEWING) rolled SCATTER. The forged row names DARTGUN, another
 *  part of LACEWING's pool, as day 2's drop. */
export const NPC_HERO: HeroId = "weaver";
export const NPC_DUSK = { day: 2, wins: 1, lives: 5 } as const;
export const NPC_ROAD: readonly RoadEntry[] = [{ day: 1, tier: "easy", outcome: "win" }, { day: 2, tier: "medium", outcome: "win", drop: "scatter" }];
export const NPC_FORGED_DROP = "dartgun";
/** The server's answer to the forged drop: validateUpload's road line (validate.ts roadProblem), inside "deck failed validation". */
export const NPC_ROAD_ERROR = `road: day 2: the seeded roll of LACEWING gave scatter, not ${NPC_FORGED_DROP}`;
/** AZ-BUMP: does the probe's rules version have the NPC day (the rules gate: PROBE_RULES at or after NPC_DAY_RULES, with the
 *  switch on, as the build ships)? */
export const probeHasNpcDay = (): boolean => npcDayGateProblem(PROBE_RULES) === null;
/** The decks the probe stores when every check passes: PROBE_STORED, the honest LAST CHANCE deck under rules with it, and
 *  the honest NPC-day deck under rules with the NPC day (AZ-BUMP). */
export const probeStored = (): number => PROBE_STORED + (probeHasLastChance() ? 1 : 0) + (probeHasNpcDay() ? 1 : 0);
export const PROBE_TIMEOUT_MS = 15_000;
export const PROBE_USAGE = "usage: node server/dist/ghost-probe.mjs <base-url> <id-file>   (base url: http(s)://host[:port], no path; an id file that holds no id yet)";
/** The server's answer to a POST without the signing headers (identity.ts uploadHeaderError). */
export const UNSIGNED_ERROR = `unsigned upload: the ${KEY_HEADER} and ${SIG_HEADER} headers are required`;
/** H2's answer to a record no run can carry into that dusk (server/app.ts, POST step 6). */
export const recordError = (d: { day: number; wins: number; lives: number }): string =>
  `record: ${d.wins}W ${d.lives} lives is no record a run carries into dusk ${d.day}`;
/** Z-PREP (REQ-BFG-073): the same answer for an upload that carries a LAST CHANCE (server/app.ts, POST step 6). */
export const lcRecordError = (d: { day: number; wins: number; lives: number }, lcDay: number): string =>
  `${recordError(d)} after a LAST CHANCE on day ${lcDay}`;
/** The strict decode's answer to a hero bb-0.10.0 does not take (snapshot.ts checkSnapshot, rulesGate.ts heroGateProblem). */
export const heroError = (hero: HeroId): string => `snapshot.hero: rules ${PROBE_RULES} accept only ${PROBE_ACCEPTED}, not ${hero.toUpperCase()}`;

export interface ProbeAnswer {
  status: number;
  text: string;
  id?: string;
  error?: string;
  errors?: string[];
}

/** One planned POST: the snapshot, the exact body text, signed or not, and what must come back. */
export interface PlannedPost {
  name: string;
  snapshot: GhostSnapshot;
  text: string;
  signed: boolean;
  expected: string;
  pass: (a: ProbeAnswer) => boolean;
}

export interface ProbeCheck {
  name: string;
  expected: string;
  got: string;
  ok: boolean;
  /** The answer's status; undefined when there was no answer. */
  status?: number;
}

export interface ProbeResult {
  playerId: string;
  checks: ProbeCheck[];
  ok: boolean;
  /** Checks the server answered 201 or 200: decks it holds for this player. */
  stored: number;
}

class ProbeUsageError extends Error {}

/** The base URL as an origin without a trailing slash: http(s), a host, and no path, query, fragment or credentials. */
export function probeBase(raw: string | undefined): string {
  let u: URL;
  try {
    u = new URL(raw ?? "");
  } catch {
    throw new ProbeUsageError(`not a URL: ${JSON.stringify(raw ?? "")}`);
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || u.pathname !== "/" || u.search || u.hash || u.username || u.password) {
    throw new ProbeUsageError(`expected a bare http(s) origin such as https://beltbattles.fly.dev, not ${JSON.stringify(raw)}`);
  }
  return u.origin;
}

function errText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  if (e.name === "AbortError" || e.name === "TimeoutError") return "timeout";
  const cause = (e as { cause?: unknown }).cause;
  return cause instanceof Error ? `${e.message}: ${cause.message}` : e.message;
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/**
 * The canonical text of `s` as the game's encoder writes it (encodeSnapshot: the decoder's key order, the build as the
 * strict shape check copies it), built without the encoder's rules gates. Only for heroes the encoder refuses under these
 * rules; for every other snapshot it equals encodeSnapshot(s) (tests/ghost-probe.test.ts).
 */
export function canonicalText(s: GhostSnapshot): string {
  return JSON.stringify({
    v: s.v, rules: s.rules, hero: s.hero, day: s.day, wins: s.wins, lives: s.lives,
    build: checkBuildShape(s.build, "snapshot.build", s.v), runId: s.runId, playerId: s.playerId, createdAt: s.createdAt,
    ...(s.name !== undefined ? { name: s.name } : {}), // PACKS M2: the player's name
    ...(s.seed !== undefined ? { seed: s.seed } : {}), // FLIP-X2: the v3 run seed, after the name (snapshot.ts V3_SNAPSHOT_FIELDS)
    // Z-BUMP (REQ-BFG-073, the flip): the taken LAST CHANCE, last of all { day, boon, id? } (snapshot.ts lastChanceField), so
    // the probe's own canonical bytes cover its two LAST CHANCE rows as the encoder writes them
    ...(s.lastChance !== undefined ? { lastChance: { day: s.lastChance.day, boon: s.lastChance.boon, ...(s.lastChance.id !== undefined ? { id: s.lastChance.id } : {}) } } : {}),
    // AZ-BUMP (REQ-BFG-077, REQ-BFG-078): the road log after it, last of all [{ day, tier, outcome, drop?, sabotaged? }]
    // (snapshot.ts roadField), so the probe's own canonical bytes cover its two NPC-day rows as the encoder writes them
    ...(s.road !== undefined ? { road: s.road.map((e) => ({ day: e.day, tier: e.tier, outcome: e.outcome, ...(e.drop !== undefined ? { drop: e.drop } : {}), ...(e.sabotaged ? { sabotaged: true } : {}) })) } : {}),
  });
}

/** PACKS M2 (REQ-BFG-063): the probe's player name: every upload under this build's rules (since PACKS's bb-0.8.6)
 *  carries one (POST /v1/ghosts refuses one without it, 422 "name: missing"). */
export const PROBE_NAME = "PROBE";

/** The snapshot `playerId` uploads at the dusk of `d.day` with `build`, under this build's rules. FLIP-X2: a build that
 *  holds runes travels as v3 with the run seed (PROBE_SEED), as the game's ghostOf writes it; a rune-less one as before. */
function dusk(playerId: string, hero: HeroId, d: { day: number; wins: number; lives: number }, build: GhostSnapshot["build"], runId: string, now: number): GhostSnapshot {
  const runes = (build.runes?.length ?? 0) > 0;
  return {
    v: runes ? SNAPSHOT_V3 : SNAPSHOT_VERSION, rules: RULES_VERSION, hero, day: d.day, wins: d.wins, lives: d.lives, build, runId, playerId, createdAt: now,
    name: PROBE_NAME, ...(runes ? { seed: PROBE_SEED } : {}),
  };
}

/** Z-PREP (REQ-BFG-073): FURNACE's start deck with its dawn runes of days 1..6 and the HULL card taken at the dawn of
 *  day 6, uploaded at dusk 6 (0W 2L) with a LAST CHANCE on `lcDay`. Only while the switch is on (the encoder and the
 *  decoder refuse the field otherwise). */
function lastChanceDusk(playerId: string, lcDay: number, runId: string, now: number): GhostSnapshot {
  const lcDusk = probeLastChance().dusk; // HULL-ON (HEARTS; ruling 12a42239093fb6ec): the hearts rule's LAST CHANCE dusk (was LC_DUSK)
  const build = probeRunes(heroStartBuild("furnace"), lcDusk.day);
  build.hullBonus += LAST_CHANCE_HULL;
  return { ...dusk(playerId, "furnace", lcDusk, build, runId, now), lastChance: { day: lcDay, boon: "hull" } };
}

/** AZ-BUMP (REQ-BFG-077, REQ-BFG-078): WEAVER's start deck with its dawn runes of days 1..2, uploaded at dusk 2 (1W 5L) with
 *  `road`, the road log of its two warlord fights (NPC_ROAD, or a forgery of it). Only under rules with the NPC day (the
 *  encoder and the decoder refuse the field otherwise). */
function npcDayDusk(playerId: string, road: readonly RoadEntry[], runId: string, now: number): GhostSnapshot {
  const build = probeRunes(heroStartBuild(NPC_HERO), NPC_DUSK.day);
  // HULL-ON (HEARTS; ruling 12a42239093fb6ec): day 1 won, so the start's lives (probeDusk: 10 hearts; 5 before hearts)
  return { ...dusk(playerId, NPC_HERO, probeDusk(NPC_DUSK), build, runId, now), road: road.map((e) => ({ ...e })) };
}

/** The nine POSTs, in order, for `playerId` at time `now` (eleven with LAST CHANCE; thirteen with the NPC day too, as
 *  bb-0.10.0 has both). Pure: no key, no network. */
export function probePlan(playerId: string, now: number): PlannedPost[] {
  const run = `probe-${now}`;
  const plan: PlannedPost[] = [];
  // 1-2. an honest FURNACE deck, as the game's submitGhost sends it (the canonical bytes), signed and then unsigned
  // FLIP-X2: the start deck with its day-1 rune (probeRunes), so the exact count passes and each later row fails on the
  // one rule it exists to test (the budget, the record)
  // HULL-ON (HEARTS; cap's ruling 12a42239093fb6ec): day 1 at the start's lives (probeDusk: 10 hearts; 5 before hearts)
  const honest = dusk(playerId, "furnace", probeDusk({ day: 1, wins: 0, lives: 5 }), probeRunes(heroStartBuild("furnace"), 1), run, now);
  const honestText = encodeSnapshot(honest);
  const id = ghostId(honest);
  plan.push({ name: "furnace-signed", snapshot: honest, text: honestText, signed: true, expected: `201 {"id":"${id}"}`, pass: (a) => a.status === 201 && a.id === id });
  plan.push({ name: "furnace-unsigned", snapshot: honest, text: honestText, signed: false, expected: `401 ${UNSIGNED_ERROR}`, pass: (a) => a.status === 401 && a.error === UNSIGNED_ERROR });
  // 3. dishonest: the same deck with 1000 hull (4 ARMOR PACKs; NUM-1 hull x10, was 100) more than day 1's budget pays for
  const over = dusk(playerId, "furnace", probeDusk({ day: 1, wins: 0, lives: 5 }), { ...honest.build, hullBonus: honest.build.hullBonus + 1000 }, `${run}-over`, now); // HULL-ON (HEARTS): the honest row's record
  plan.push({
    name: "dishonest-signed", snapshot: over, text: encodeSnapshot(over), signed: true, expected: "422 deck failed validation: budget: ...",
    pass: (a) => a.status === 422 && a.error === "deck failed validation" && (a.errors ?? []).some((e) => e.startsWith("budget: ")),
  });
  // 4. unreachable: the honest deck under a record no run carries into that dusk (H2's record check)
  const far = dusk(playerId, "furnace", UNREACHABLE_DUSK, honest.build, `${run}-unreachable`, now);
  const farError = recordError(UNREACHABLE_DUSK);
  plan.push({ name: "unreachable-signed", snapshot: far, text: encodeSnapshot(far), signed: true, expected: `422 ${farError}`, pass: (a) => a.status === 422 && a.error === farError });
  // 5-7. the other heroes bb-0.9.1 takes: their honest day-3 reference decks, each stored as its own record
  for (const hero of STORED_HEROES) {
    // HULL-ON (HEARTS; ruling 12a42239093fb6ec): probeDusk(HERO_DUSK), a win and a draw at the start's lives (10 hearts)
    const s = dusk(playerId, hero, probeDusk(HERO_DUSK), probeRunes(heroRefBuild(hero, HERO_DUSK.day), HERO_DUSK.day), `${run}-${hero}`, now); // FLIP-X2: 3 dawn runes
    const hid = ghostId(s);
    plan.push({ name: `hero-${hero.toUpperCase()}`, snapshot: s, text: encodeSnapshot(s), signed: true, expected: `201 {"id":"${hid}"}`, pass: (a) => a.status === 201 && a.id === hid });
  }
  // 8-9. the heroes bb-0.9.1 refuses: the same honest reference decks, as the canonical text built by hand
  for (const hero of REFUSED_HEROES) {
    const s = dusk(playerId, hero, probeDusk(HERO_DUSK), probeRunes(heroRefBuild(hero, HERO_DUSK.day), HERO_DUSK.day), `${run}-${hero}`, now); // FLIP-X2: 3 dawn runes; HULL-ON (HEARTS): probeDusk
    const want = heroError(hero);
    plan.push({ name: `hero-${hero.toUpperCase()}`, snapshot: s, text: canonicalText(s), signed: true, expected: `400 ${want}`, pass: (a) => a.status === 400 && a.error === want });
  }
  // 10-11. Z-PREP (REQ-BFG-073): LAST CHANCE's rows, under rules with LAST CHANCE (Z-BUMP: the rules gate, not the switch)
  if (probeHasLastChance()) {
    const plc = probeLastChance(); // HULL-ON (HEARTS; ruling 12a42239093fb6ec): the hearts rule's LAST CHANCE (was LC_DUSK, LC_DAY)
    const lc = lastChanceDusk(playerId, plc.day, `${run}-lastchance`, now);
    const lid = ghostId(lc);
    plan.push({ name: "lastchance-signed", snapshot: lc, text: encodeSnapshot(lc), signed: true, expected: `201 {"id":"${lid}"}`, pass: (a) => a.status === 201 && a.id === lid });
    const forged = lastChanceDusk(playerId, LC_FORGED_DAY, `${run}-lastchance-day3`, now);
    const fErr = lcRecordError(plc.dusk, LC_FORGED_DAY);
    plan.push({ name: "lastchance-day3", snapshot: forged, text: encodeSnapshot(forged), signed: true, expected: `422 ${fErr}`, pass: (a) => a.status === 422 && a.error === fErr });
  }
  // 12-13. AZ-BUMP (REQ-BFG-077, REQ-BFG-078): the NPC day's rows, under rules with the NPC day (the rules gate): an honest
  // NPC-day upload with its road log and a drop, then the same with day 2's drop forged
  if (probeHasNpcDay()) {
    const nd = npcDayDusk(playerId, NPC_ROAD, `${run}-npcday`, now);
    const nid = ghostId(nd);
    plan.push({ name: "npcday-signed", snapshot: nd, text: encodeSnapshot(nd), signed: true, expected: `201 {"id":"${nid}"}`, pass: (a) => a.status === 201 && a.id === nid });
    const forgedRoad = NPC_ROAD.map((e) => (e.day === NPC_DUSK.day ? { ...e, drop: NPC_FORGED_DROP } : e));
    const nf = npcDayDusk(playerId, forgedRoad, `${run}-npcday-forged`, now);
    plan.push({
      name: "npcday-forged", snapshot: nf, text: encodeSnapshot(nf), signed: true, expected: `422 deck failed validation: ${NPC_ROAD_ERROR}`,
      pass: (a) => a.status === 422 && a.error === "deck failed validation" && (a.errors ?? []).includes(NPC_ROAD_ERROR),
    });
  }
  return plan;
}

/** One POST /v1/ghosts with these exact body bytes. Throws on no answer (a network error or the timeout). */
async function post(base: string, body: Uint8Array<ArrayBuffer>, headers: Record<string, string>, timeoutMs: number): Promise<ProbeAnswer> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body, signal: ctl.signal });
    const text = await res.text();
    let o: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) o = parsed as Record<string, unknown>;
    } catch {
      /* not JSON: shown as text */
    }
    return {
      status: res.status, text,
      id: typeof o.id === "string" ? o.id : undefined,
      error: typeof o.error === "string" ? o.error : undefined,
      errors: Array.isArray(o.errors) ? o.errors.filter((e): e is string => typeof e === "string") : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** An answer on one line: the status, then the id, or the error and its first detail, or the body (clipped). */
function shown(a: ProbeAnswer): string {
  const detail = a.id !== undefined ? `{"id":"${a.id}"}` : a.error !== undefined ? `${a.error}${a.errors?.length ? `: ${a.errors[0]}` : ""}` : a.text;
  const one = detail.replace(/\s+/g, " ").trim();
  return `${a.status} ${one.length > 200 ? `${one.slice(0, 197)}...` : one}`;
}

/**
 * The nine checks against `base`. `saveId` gets the probe's player id before the first POST. Resolves every check, each
 * with what was expected and what came back; a POST with no answer is a failed check. Throws only if no identity can be
 * made or `saveId` throws, before any POST.
 */
export async function runProbe(base: string, saveId: (playerId: string) => void, timeoutMs = PROBE_TIMEOUT_MS, now = Date.now()): Promise<ProbeResult> {
  const me = await loadIdentity(memoryKeyStore());
  if (!me) throw new Error("no WebCrypto (crypto.subtle) here: cannot make a device identity");
  saveId(me.playerId);
  const checks: ProbeCheck[] = [];
  for (const p of probePlan(me.playerId, now)) {
    let got: string, ok = false, status: number | undefined;
    try {
      const body = utf8(p.text);
      const headers: Record<string, string> = {};
      if (p.signed) {
        const { key, sig } = await me.sign(body); // the game's own signing: UPLOAD_PREFIX + these exact bytes
        headers[KEY_HEADER] = key;
        headers[SIG_HEADER] = sig;
      }
      const a = await post(base, body, headers, timeoutMs);
      status = a.status;
      got = shown(a);
      ok = p.pass(a);
    } catch (e) {
      got = `no answer (${errText(e)})`;
    }
    checks.push({ name: p.name, expected: p.expected, got, ok, status });
  }
  const stored = checks.filter((c) => c.status === 201 || c.status === 200).length;
  return { playerId: me.playerId, checks, ok: checks.every((c) => c.ok), stored };
}

/** The command line: <base-url> <id-file>. Resolves the exit code (0 every check as expected, 1 not, 2 usage). */
export async function probeMain(argv: readonly string[], out: (line: string) => void, timeoutMs = PROBE_TIMEOUT_MS): Promise<number> {
  let base: string, idFile: string;
  try {
    if (argv.length !== 2) throw new ProbeUsageError(`expected 2 arguments, got ${argv.length}`);
    base = probeBase(argv[0]);
    idFile = argv[1];
    if (!idFile || idFile.startsWith("-")) throw new ProbeUsageError(`the id file must be a path, not ${JSON.stringify(idFile)}`);
    let held = "";
    try {
      held = existsSync(idFile) ? readFileSync(idFile, "utf8").trim() : "";
    } catch {
      throw new ProbeUsageError(`cannot read the id file ${idFile}`);
    }
    if (held) throw new ProbeUsageError(`${idFile} already holds a probe player id: clean that player up first (RUNBOOK section 9), then move the file away`);
  } catch (e) {
    if (!(e instanceof ProbeUsageError)) throw e;
    out(`ghost-probe: ${e.message}`);
    out(PROBE_USAGE);
    return 2;
  }
  if (RULES_VERSION !== PROBE_RULES) {
    out(`ghost-probe: this build's rules are ${RULES_VERSION}, but the probe's expectations are written for ${PROBE_RULES}`);
    return 2;
  }
  out(`probe: POST ${base}/v1/ghosts as a fresh device (rules ${RULES_VERSION}); only the FURNACE, WEAVER, FOUNDRY and BASTION decks may be stored`);
  let r: ProbeResult;
  try {
    r = await runProbe(base, (playerId) => writeFileSync(idFile, `${playerId}\n`), timeoutMs);
  } catch (e) {
    out(`ghost-probe failed before any upload: ${errText(e)}`);
    return 1;
  }
  for (const c of r.checks) out(`${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(18)} expected: ${c.expected} | got: ${c.got}`);
  out(`probe player: ${r.playerId}`);
  out(`probe: ${r.checks.filter((c) => c.ok).length} of ${r.checks.length} checks as expected; the server stored ${r.stored} deck(s) for this player (expected ${probeStored()}); the player id is in ${idFile}`);
  return r.ok ? 0 : 1;
}
