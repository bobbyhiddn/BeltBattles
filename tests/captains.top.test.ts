// BUMP-1J PIN-TOP (REQ-BFG-124 line 7; RULING-BUMP1J-R1): THE LUCK TOP, pinned, with no list of exceptions.
//
// WHAT IT PINS. REQ-BFG-124 line 7: "No captain holds more parts than the luckiest player's shop could give by that day." READ-1J measured it
// (its REPORT section 2, rows/L1-field.tsv column max_192): THE TOP is the par field's MAXIMUM on seeds 1-192, for each hero, each day 1-10 and
// each of the six luck measures (value, star2, star3, rare, epic, turrets; src/sim/harness/luck.ts). The field is the luck table's own
// (parLuckField: the par player's real runs through the game's caravan), read on more seeds: the table keeps seeds 1-48 (P50 and P90), the top
// takes all 192. The par field is the par policy's shop, not a player who hunts rare parts, so the top is a LOW estimate of the luckiest shop and
// a deck under it is surely inside the line (R1.1). tests/captains.top.data.ts holds the top as a generated, pinned table (CAPTAINS_TOP).
//
// THE LINE reads every captain deck the game can field on days 1-10, 363 deck-days (R1.1): the dusk deck (standInBuild) and the road deck
// (rivalLoadout) of the 18 captains other than the Iron Matriarch, read exactly as tests/captains.luck.test.ts reads them (180 + 180), and the
// Matriarch's road deck on her days 8-10 at her own luck, stars (3). It fails when any deck holds a measure above the top of its hero and day.
// There is NO list of exceptions: no allowance, no pinned over, no per-captain switch. On the live rules (bb-0.16.0) 0 of the 363 are over on any
// measure (R1.2), so nothing was trimmed. A captain plan that grows past the luckiest player turns THE LINE red and names the deck.
//
// A DIFFERENT QUESTION FROM THE TIER LISTS (R1.3). tests/captains.luck.test.ts reads the captains against their TIER caps (ORDINARY = P50, GOOD =
// P90 of seeds 1-48) and carries two lists of 149 pinned overs. Twelve of those sit over GOOD and none over the top: they are over the tier's own
// line, not over the luckiest player. The lists stay a difficulty tool as they are. This file does not read them, and they excuse nothing here.
//
// LIMITS. Past day 10 nothing is read (R1.5): the field, the luck table and these tests stop at day 10 (RUN_DAYS). A deck whose day is past the
// table's last day FAILS THE LINE; it is never skipped. The joint reading (one real par player holding the whole deck on every measure at once)
// is a note, not a gate (R1.4).
//
// CASES. THE LINE. FRESH: the data's fingerprints are LUCK_CAPS.fingerprint's, hero by hero, and its seeds are 192 (the luck test already ties
// LUCK_CAPS.fingerprint to the live par run, so a moved par field reaches this file through the luck table). SANE: in each of the 240 cells the top is
// at least the committed GOOD cap and at least the ORDINARY cap. THE GENERATOR: off unless LUCK_TOP is set.
//
// REGENERATE. tests/captains.top.data.ts is GENERATED; never edit it. THE GENERATOR (the last case) is off unless the environment variable
// LUCK_TOP is set: a plain `npx vitest run tests/captains.top.test.ts` skips it and takes seconds. It recomputes the par field's maximum on seeds
// 1-192 with the game's own functions (parLuckField and luckMeasures). Modes:
//   LUCK_TOP=write           one process, every hero: rewrites tests/captains.top.data.ts
//   LUCK_TOP=check           one process, every hero: compares the data file with the field and names the cells that differ; writes nothing
//   LUCK_TOP=write:<hero>    one hero (furnace, weaver, foundry or bastion): writes that hero's PIECE, captains.top.<hero>.json, into the directory LUCK_TOP_DIR
//   LUCK_TOP=check:<hero>    one hero: the check of that hero alone
//   LUCK_TOP=join            reads the four pieces in LUCK_TOP_DIR and rewrites tests/captains.top.data.ts from them
// Four processes share the work: one `LUCK_TOP=write:<hero> LUCK_TOP_DIR=<dir> nice -n 19 npx vitest run tests/captains.top.test.ts -t GENERATOR --maxWorkers=1`
// per hero, then ONE `LUCK_TOP=join LUCK_TOP_DIR=<dir> nice -n 19 npx vitest run tests/captains.top.test.ts -t GENERATOR --maxWorkers=1` joins the pieces
// (it first checks each piece's hero, seeds, rules and fingerprint). A write refuses to start when the par player's seed-1 run no longer fingerprints
// as the luck table says: run `npm run luckcaps` first (the luck test says the same). The first time, create tests/captains.top.data.ts as a stub
// (`top: {}`, as CAPTAINS_TOP is typed), because this file imports it.
// TIME (an idle 24-core host, nice -n 19, 2026-11-11, bb-0.16.0): the four one-hero processes side by side took 205 s in all (bastion 84 s, furnace 89 s,
// weaver 152 s, foundry 205 s) and the join 1 s; LUCK_TOP=check in one process for all four heroes took 498 s (furnace 80 s, weaver 144 s, foundry 196 s,
// bastion 77 s). The per-test timeout of THE GENERATOR is 2 hours.

import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { LUCK_CAPS } from "../src/sim/harness/luckCapsData";
import { LUCK_HEROES, MEASURES, luckMeasures, parLuckField, parRunFingerprint, type LuckMeasures } from "../src/sim/harness/luck";
import { RIVALS, RIVAL_IDS, RUN_DAYS, rivalDays, rivalLoadout, standInBuild, type RivalId } from "../src/sim/rivals";
import { CAPTAINS_TOP } from "./captains.top.data";

const ROOT = new URL("..", import.meta.url).pathname;
const DATA = join(ROOT, "tests/captains.top.data.ts");
/** The par runs per hero that make the top: seeds 1..SEEDS. */
const SEEDS = 192;
const REGEN = "LUCK_TOP=write nice -n 19 npx vitest run tests/captains.top.test.ts (one process, or one hero a process: see the header of tests/captains.top.test.ts)";

const STAND_INS = RIVAL_IDS.filter((id) => id !== "matriarch");
const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);

/** One captain deck on one day, read as the luck test reads it. */
interface DeckDay { id: RivalId; moment: "dusk" | "road"; day: number; m: LuckMeasures }

/** Every captain deck the game can field on days 1-10 (R1.1). The dusk and road decks of the 18 captains are read exactly as
 *  tests/captains.luck.test.ts reads them (its "stand-in deck" and "warlord deck" cases); the Iron Matriarch, whom that test leaves out,
 *  is read the road way on her rivalDays at her own luck (rivalLoadout's default, luckOf: stars). */
function deckDays(): DeckDay[] {
  const out: DeckDay[] = [];
  for (const id of STAND_INS) for (const day of DAYS) out.push({ id, moment: "dusk", day, m: luckMeasures(standInBuild(id, day)) });
  const road = (id: RivalId, day: number): DeckDay => {
    const l = rivalLoadout(id, day); // a warlord's hull is the free PvE ramp: its value is what its plan bought, as the luck test reads it
    return { id, moment: "road", day, m: { ...luckMeasures(l.build), value: l.value } };
  };
  for (const id of STAND_INS) for (const day of rivalDays(id)) out.push(road(id, day));
  for (const day of rivalDays("matriarch")) out.push(road("matriarch", day));
  return out;
}

describe("THE LUCK TOP (REQ-BFG-124 line 7; RULING-BUMP1J-R1): no captain holds more than the luckiest player's shop could give", () => {
  it("THE LINE: no captain deck-day holds a measure above the top of its hero and day (363 deck-days, no list of exceptions)", () => {
    const decks = deckDays();
    expect(
      { dusk: decks.filter((d) => d.moment === "dusk").length, road: decks.filter((d) => d.moment === "road" && d.id !== "matriarch").length, matriarch: decks.filter((d) => d.id === "matriarch").length },
      "the deck-days read: the 18 captains' dusk decks, their road decks, the Iron Matriarch's road deck",
    ).toEqual({ dusk: 180, road: 180, matriarch: 3 });
    expect(decks, "the deck-days read in all").toHaveLength(363);
    const over: string[] = [];
    for (const d of decks) {
      const hero = RIVALS[d.id].hero;
      const top = CAPTAINS_TOP.top[hero]?.[d.day - 1];
      const at = `${d.id} (${hero}) ${d.moment} d${d.day}`;
      if (!top) { // a day past the table's last day is a failure, never a skip
        over.push(`${at}: the top has no day ${d.day} for ${hero} (it ends at day ${CAPTAINS_TOP.top[hero]?.length ?? 0}); ${REGEN}`);
        continue;
      }
      for (const k of MEASURES) {
        if (typeof top[k] !== "number") over.push(`${at} ${k}: ${d.m[k]}, but the top holds no number for it`);
        else if (d.m[k] > top[k]) over.push(`${at} ${k}: ${d.m[k]} > top ${top[k]}`);
      }
    }
    expect(over, "a captain deck holds more than the luckiest player's top (REQ-BFG-124 line 7, RULING-BUMP1J-R1): re-plan the captain (src/sim/rivalBuilds.ts); this line takes no exception and the table is not raised by hand").toEqual([]);
  });

  it("FRESH: the top's fingerprints are the committed luck table's, hero by hero, and its seeds are 192", () => {
    const how = `regenerate the top: ${REGEN}`;
    expect(CAPTAINS_TOP.seeds, `the top is the par field's maximum on seeds 1-${SEEDS}; ${how}`).toBe(SEEDS);
    const stale = LUCK_HEROES.filter((h) => CAPTAINS_TOP.fingerprint[h] !== LUCK_CAPS.fingerprint[h]).map((h) => `${h}: the top was made under ${CAPTAINS_TOP.fingerprint[h]}, the luck table says ${LUCK_CAPS.fingerprint[h]}`);
    expect(stale, `the committed luck table (src/sim/harness/luckCapsData.ts) moved since the top was made; ${how}`).toEqual([]);
  });

  it("SANE: in each of the 240 cells the top is at least the committed GOOD cap and at least the ORDINARY cap", () => {
    const bad: string[] = [];
    let cells = 0;
    for (const hero of LUCK_HEROES) {
      LUCK_CAPS.caps[hero]!.forEach((c, i) => {
        for (const k of MEASURES) {
          cells++;
          const t = CAPTAINS_TOP.top[hero]?.[i]?.[k];
          if (typeof t !== "number") bad.push(`${hero} d${i + 1} ${k}: the top holds no number`);
          else for (const tier of ["good", "ordinary"] as const) if (t < c[tier][k]) bad.push(`${hero} d${i + 1} ${k}: top ${t} < the ${tier} cap ${c[tier][k]}`);
        }
      });
    }
    expect(cells, "the cells read: 4 heroes x 10 days x 6 measures").toBe(240);
    expect(bad, `the top is the maximum of seeds 1-${SEEDS}, which include the 48 the caps are read from, so it cannot sit under a cap; ${REGEN}`).toEqual([]);
  });
});

// ---------------------------------------------------------------- THE GENERATOR (off unless LUCK_TOP is set)

const MODE = process.env.LUCK_TOP ?? "";
const [VERB, WHO] = MODE.split(":");
const PIECES = process.env.LUCK_TOP_DIR ?? "";
const USAGE = `LUCK_TOP=${MODE}: it is write, check, write:<hero>, check:<hero> or join (a hero is ${LUCK_HEROES.join(", ")}); the one-hero writes and join need LUCK_TOP_DIR`;

/** One hero's top as made now, or read from a piece file. */
interface Piece { hero: HeroId; seeds: number; rules: string; fingerprint: string; top: LuckMeasures[] }
const pieceFile = (hero: HeroId): string => join(PIECES, `captains.top.${hero}.json`);

/** The par field's maximum of every measure on seeds 1..SEEDS, day by day (parLuckField: the luck table's own field, days 1-10), with the live seed-1 fingerprint. */
function makePiece(hero: HeroId): Piece {
  const t0 = Date.now();
  const field = parLuckField(hero, SEEDS); // field[day - 1][i] = the dusk deck's measures of seed i + 1 (luckMeasures)
  const top = field.map((day) => {
    expect(day, `${hero}: the seeds read`).toHaveLength(SEEDS);
    return Object.fromEntries(MEASURES.map((k) => [k, Math.max(...day.map((m) => m[k]))])) as unknown as LuckMeasures;
  });
  console.log(`LUCK_TOP ${hero}: ${SEEDS} seeds, ${top.length} days, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { hero, seeds: SEEDS, rules: RULES_VERSION, fingerprint: parRunFingerprint(hero), top };
}

/** A write needs the luck table to describe the live par field: its fingerprint is what the data records (checked before the long run). */
function refuseStale(hero: HeroId): void {
  expect(parRunFingerprint(hero), `${hero}: the par player's seed-1 run no longer fingerprints as the committed luck table says; run \`npm run luckcaps\` first (tests/captains.luck.test.ts says the same)`).toBe(LUCK_CAPS.fingerprint[hero]);
}

/** A piece fit to be written: its hero, seeds, rules and fingerprint are the ones this tree and its luck table have, and every cell is a count. */
function accept(p: Piece | undefined, hero: HeroId): Piece {
  expect(p, `${hero}: no piece`).toBeDefined();
  const q = p!;
  expect([q.hero, q.seeds, q.rules], `${hero}: the piece's hero, seeds and rules`).toEqual([hero, SEEDS, RULES_VERSION]);
  expect(q.fingerprint, `${hero}: the piece was made under ${q.fingerprint}, the luck table says ${LUCK_CAPS.fingerprint[hero]}; run \`npm run luckcaps\` first, then make the piece again`).toBe(LUCK_CAPS.fingerprint[hero]);
  expect(q.top, `${hero}: the piece's days`).toHaveLength(LUCK_CAPS.caps[hero]!.length);
  q.top.forEach((m, i) => { for (const k of MEASURES) expect(Number.isInteger(m[k]) && m[k] >= 0, `${hero} d${i + 1} ${k}: ${m[k]} is not a count`).toBe(true); });
  return q;
}

const rowText = (m: LuckMeasures): string => `{ ${MEASURES.map((k) => `${k}: ${m[k]}`).join(", ")} }`;

/** The data module's text (deterministic: the same four pieces give the same bytes). */
function render(pieces: readonly Piece[]): string {
  const of = (h: HeroId): Piece => pieces.find((p) => p.hero === h)!;
  const L = [
    "// GENERATED by tests/captains.top.test.ts (THE GENERATOR: LUCK_TOP=write, or write:<hero> four times and join); do not edit.",
    `// Regenerate: ${REGEN}.`,
    "// Check it with `LUCK_TOP=check nice -n 19 npx vitest run tests/captains.top.test.ts`, which writes nothing and names the cells that differ.",
    "// THE LUCK TOP (BUMP-1J PIN-TOP, REQ-BFG-124 line 7, RULING-BUMP1J-R1.1): per hero and day (index day - 1), the par field's MAXIMUM of each luck",
    `// measure (src/sim/harness/luck.ts: value, star2, star3, rare, epic, turrets) over the par player's seeds 1-${SEEDS} (parLuckField(hero, ${SEEDS})).`,
    "// seeds: the par runs per hero. rules: RULES_VERSION when it was made (information, not asserted). fingerprint: the committed luck table's",
    "// (LUCK_CAPS.fingerprint) when it was made; tests/captains.top.test.ts FRESH holds it equal to the table's, hero by hero.",
    "",
    'import type { HeroId } from "../src/sim/content";',
    'import type { LuckCapsTable, LuckMeasures } from "../src/sim/harness/luck";',
    "",
    'export const CAPTAINS_TOP: Pick<LuckCapsTable, "seeds" | "fingerprint"> & { rules: string; top: Partial<Record<HeroId, LuckMeasures[]>> } = {',
    `  seeds: ${SEEDS},`,
    `  rules: ${JSON.stringify(RULES_VERSION)},`,
    `  fingerprint: { ${LUCK_HEROES.map((h) => `${h}: ${JSON.stringify(of(h).fingerprint)}`).join(", ")} },`,
    "  top: {",
  ];
  for (const h of LUCK_HEROES) {
    L.push(`    ${h}: [`);
    of(h).top.forEach((m, i) => L.push(`      ${rowText(m)}, // day ${i + 1}`));
    L.push("    ],");
  }
  L.push("  },", "};", "");
  return L.join("\n");
}

/** The cells where the data file and a freshly made piece differ (empty: identical, `rules` aside). */
function differences(p: Piece): string[] {
  const out: string[] = [];
  if (CAPTAINS_TOP.seeds !== p.seeds) out.push(`seeds: data ${CAPTAINS_TOP.seeds}, field ${p.seeds}`);
  if (CAPTAINS_TOP.fingerprint[p.hero] !== p.fingerprint) out.push(`${p.hero} fingerprint: data ${CAPTAINS_TOP.fingerprint[p.hero]}, the par player's seed-1 run ${p.fingerprint}`);
  const data = CAPTAINS_TOP.top[p.hero] ?? [];
  if (data.length !== p.top.length) out.push(`${p.hero}: ${data.length} days in the data, ${p.top.length} in the field`);
  p.top.forEach((m, i) => { for (const k of MEASURES) if (data[i]?.[k] !== m[k]) out.push(`${p.hero} d${i + 1} ${k}: data ${data[i]?.[k]}, field ${m[k]}`); });
  return out;
}

describe.skipIf(MODE === "")(`THE GENERATOR (${MODE === "" ? "off: set LUCK_TOP to run it" : `LUCK_TOP=${MODE}`}): the par field's maximum on seeds 1-${SEEDS}, written to or compared with tests/captains.top.data.ts`, () => {
  it("recomputes the top with parLuckField and luckMeasures, and writes it, writes one hero's piece, joins the pieces or checks the data", () => {
    const heroes = WHO === undefined ? LUCK_HEROES : LUCK_HEROES.filter((h) => h === WHO);
    const needsDir = VERB === "join" || (VERB === "write" && WHO !== undefined); // the pieces are written to and read from LUCK_TOP_DIR
    const usable = (VERB === "write" || VERB === "check" || VERB === "join") && heroes.length > 0 && !(VERB === "join" && WHO !== undefined) && (!needsDir || PIECES !== "");
    expect(usable, USAGE).toBe(true);
    if (VERB === "join") {
      const pieces = LUCK_HEROES.map((h) => {
        expect(existsSync(pieceFile(h)), `${h}: no piece at ${pieceFile(h)}; run LUCK_TOP=write:${h} LUCK_TOP_DIR=${PIECES} first`).toBe(true);
        return accept(JSON.parse(readFileSync(pieceFile(h), "utf8")) as Piece, h);
      });
      writeFileSync(DATA, render(pieces));
      console.log(`LUCK_TOP join: wrote ${DATA} from ${PIECES}`);
    } else if (VERB === "check") {
      const diff = heroes.flatMap((h) => differences(makePiece(h)));
      expect(diff, `the data file differs from the par field; ${REGEN}`).toEqual([]);
      console.log(`LUCK_TOP check: ${heroes.join(", ")} identical to tests/captains.top.data.ts`);
    } else if (WHO === undefined) {
      for (const h of heroes) refuseStale(h);
      writeFileSync(DATA, render(heroes.map((h) => accept(makePiece(h), h))));
      console.log(`LUCK_TOP write: wrote ${DATA}`);
    } else {
      const hero = heroes[0]; // write:<hero>: this hero's piece, for LUCK_TOP=join
      refuseStale(hero);
      mkdirSync(PIECES, { recursive: true });
      writeFileSync(pieceFile(hero), JSON.stringify(accept(makePiece(hero), hero)) + "\n");
      console.log(`LUCK_TOP write:${hero}: wrote ${pieceFile(hero)}`);
    }
  }, 7_200_000);
});
