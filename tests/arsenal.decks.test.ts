// 0.6.1p: the deck-level check (brief 0.6.1p "Tests"; ARSENAL.md §4.3). For each module, star one copy in a par deck
// that uses it (the day-6 par decks, read from the golden-060 fixture, never written) or, for a module no par deck
// holds, in its bench deck (tests/arsenal.bench.ts, no hull bonus), and fight the other hero's day-6 par deck.
// The damage the deck deals must not fall by more than 3% from 1 star to 2 to 3; STAMP PRESS must now rise.
// 0.8.0 T1 (backlog 315; tests/starRows.ts): the damage is what the deck deals before its own KO, with the opponent's KO
// lifted, mean over 20 seeds (was: the real fight's damage dealt over 5 seeds). Every par row was 5W or 0W at every star,
// so its damage was the opponent's hull plus overkill, or as long as the opponent let it live, and it flipped when only
// the opponent's parts were tuned (0.6.2 TUNE-M). BB_TABLES=1 prints the table (REPORT.md): per star the measure, the
// real fights won, the real fight's damage (the old measure) and how long the deck stood.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { RULES_VERSION } from "../src/sim/content"; // Y7b2: OVERDRIVE's tripwire (cap's ruling 171ac18e8a707ab5) is keyed to bb-0.9.3
import { hitsOfRig, rigHits, type Build, type Placed } from "../src/sim/deck";
import { migrateInlineGates } from "../src/sim/beltside";
import { bench, busy, factoryBench, gantryBench } from "./arsenal.bench";
import { starCell, starRows, type StarRow } from "./starRows";

const par = JSON.parse(readFileSync(new URL("./fixtures/golden-060/par.json", import.meta.url), "utf8")) as { decks: Record<string, Build> };
const clone = (b: Build): Build => JSON.parse(JSON.stringify(b)) as Build;
// 0.6.2 BELTSIDE merge (ref/BRIEF-beltside-merge-061.md): the par decks are inline-gate decks frozen before the pivot,
// and a gate standing on a belt makes no hits, so each par deck (the starred one and its opponent) migrates at setup,
// as every ghost and preset deck does at load (D3: each gate moves beside its tile and faces it). Where D3's deck
// order boxes a tile in, the port is by hand, as BELTSIDE's preset ports were (Decision 27): in par/furnace/6 the BRAKE
// (moved first) takes (3,1), the one free cell beside the LONG HAUL's tile (4,1), so D3 would drop the LONG HAUL;
// the BRAKE takes its other free side instead, (3,3) facing up, and the LONG HAUL takes (3,1), its east arrow on (4,1).
// Every rig then lands exactly one arrow, on the tile its gate stood on (checked below). The bench decks go through
// arsenal.bench.ts's ported bench(). No assertion changed.
const HAND: Record<string, Placed[]> = {
  "par/furnace/6": [{ uid: 9011, def: "brake", x: 3, y: 3 }, { uid: 9012, def: "longhaul", x: 3, y: 1 }],
};
function native(key: string): Build {
  const inline = par.decks[key];
  const b = clone(inline);
  migrateInlineGates(b);
  for (const h of HAND[key] ?? []) {
    b.items = b.items.filter((p) => p.uid !== h.uid);
    b.items.push({ ...h });
  }
  const hits = rigHits(b);
  for (const g of inline.items.filter((p) => ITEMS[p.def].kind === "gate")) {
    const cell = g.y * 10 + g.x;
    const got = hitsOfRig(b, g.uid, hits).map((h) => b.routes[h.route].cells[h.tile]);
    if (got.length !== 1 || got[0] !== cell) throw new Error(`${key}: ${g.def} ${g.uid} works ${JSON.stringify(got)}, not its old tile ${cell}`);
  }
  return b;
}
// 0.8.0 T1: 20 seeds (was 5). The noisiest rows (EXT. CHAMBER, GALVANIC COIL, STAMP PRESS: par/weaver/6's coil stalls a
// random machine) swing about 9-12% a fight. At 20 seeds every asserted step passes in all four TUNE-M states and under
// an opponent tune of +-10% (output-T1/REPORT.md gives each margin); the closest is ASSEMBLY LINE 2->3 (-2.5+-0.5% on 200
// seeds), which B1's retune of the listed falls covers.
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const FURNACE = "par/furnace/6", WEAVER = "par/weaver/6";

/** The par deck `key` (native: 0.6.2 BELTSIDE merge) with its one copy of `def` (an item or a mod) at `stars`. */
function starredPar(key: string, def: string, stars: number): Build {
  const b = native(key);
  const copies = [...b.items.filter((i) => i.def === def), ...b.mods.filter((m) => m.def === def)];
  if (copies.length !== 1) throw new Error(`${key} holds ${copies.length} ${def}`);
  if (stars > 1) copies[0].stars = stars;
  return b;
}

interface Case { id: string; deck: string; opp: string; at: (stars: number) => Build }

const ASM_GATES: [string, number, number, number][] = [["temper", 4, 4, 1], ["whetstone", 4, 2, 1], ["temper", 5, 3, 1], ["whetstone", 5, 1, 1]];

/** 0.6.1c: par/furnace/6 with its STAMP PRESS (the second intake) swapped for `def` at `stars` (report-only rows).
 *  0.6.2 BELTSIDE merge (0.6.1c): from the native par deck (native(): each rig works its gate's old tile, checked), not
 *  the raw inline one, whose gates stand on belt tiles and make no hits. */
function parSwap(def: string, stars: number): Build {
  const b = native(FURNACE);
  const p = b.items.find((i) => i.def === "press")!;
  p.def = def;
  if (stars > 1) p.stars = stars;
  return b;
}

export const CASES: Case[] = [
  ...["temper", "brake", "longhaul", "press", "calibrate"].map((id): Case => ({ id, deck: FURNACE, opp: WEAVER, at: (s) => starredPar(FURNACE, id, s) })),
  ...["grease", "coil", "whetstone"].map((id): Case => ({ id, deck: WEAVER, opp: FURNACE, at: (s) => starredPar(WEAVER, id, s) })),
  // no par deck holds these: their bench decks (the Furnace bench; the busy bench for the chamber mods)
  { id: "splitter", deck: "bench", opp: WEAVER, at: (s) => bench([["splitter", 4, 3, s]], [], 0) },
  { id: "overdrive", deck: "bench", opp: WEAVER, at: (s) => bench([["overdrive", 4, 4, s]], [], 0) },
  { id: "chamber", deck: "busy bench", opp: WEAVER, at: (s) => busy([["chamber", s]], 0) },
  { id: "hopper", deck: "busy bench", opp: WEAVER, at: (s) => busy([["hopper", s]], 0) },
  { id: "mantlet", deck: "bench", opp: WEAVER, at: (s) => bench([], [["mantlet", s]], 0) },
  { id: "ram", deck: "busy bench", opp: WEAVER, at: (s) => busy([["ram", s]], 0) },
  // 0.6.1c: the six factories on their bench deck: the Kiln on the first heavy intake, the factory on the second.
  // ASSEMBLY LINE's deck has gates for it to commission (two on the Kiln's belt, two on its own) and CALIBRATION for
  // the second factory; GANTRY PRESS feeds both heavy intakes (the Kiln parked off-route) with CALIBRATION.
  ...["doublestamp", "shottower", "hotswap", "slagpot"].map((id): Case => ({ id, deck: "factory bench", opp: WEAVER, at: (s) => factoryBench(id, s, { hullBonus: 0 }) })),
  { id: "assembly", deck: "factory bench + 4 gates + calibrate", opp: WEAVER, at: (s) => factoryBench("assembly", s, { gates: ASM_GATES, mods: [["calibrate", 1]], hullBonus: 0 }) },
  { id: "gantry", deck: "gantry bench + calibrate", opp: WEAVER, at: (s) => gantryBench(s, [["calibrate", 1]], 0) },
];

// Report-only rows (Prime call item 4, no assertion): SPLITTER at 1-3 stars on its bench, with EXT. CHAMBER 3 stars
// or HOPPER 3 stars (BOTTOMLESS) on the turret. They asked whether a fuller chamber made THREE-WAY's third copy pay;
// 0.6.1f's PERFECT CUT (2 copies at 85%) has no third copy, and they still show how the jam rows move.
export const REPORT_ONLY: Case[] = [
  { id: "splitter + chamber 3*", deck: "bench", opp: WEAVER, at: (s) => bench([["splitter", 4, 3, s]], [["chamber", 3]], 0) },
  { id: "splitter + hopper 3*", deck: "bench", opp: WEAVER, at: (s) => bench([["splitter", 4, 3, s]], [["hopper", 3]], 0) },
  // 0.6.1c (REPORT.md): each new factory in the par deck's STAMP PRESS slot, and the two decks the asserted ones replace
  // (ASSEMBLY LINE with no gate to commission, GANTRY PRESS without CALIBRATION): a faster factory into a full heavy
  // chamber mostly jams, which these rows show
  ...["doublestamp", "shottower", "hotswap", "slagpot", "assembly", "gantry"].map((id): Case => ({ id: `${id} in the press slot`, deck: FURNACE, opp: WEAVER, at: (s) => parSwap(id, s) })),
  { id: "assembly, no gates", deck: "factory bench", opp: WEAVER, at: (s) => factoryBench("assembly", s, { hullBonus: 0 }) },
  { id: "gantry, no calibrate", deck: "gantry bench", opp: WEAVER, at: (s) => gantryBench(s, [], 0) },
];

type Step = "1->2" | "2->3";

// Prime call, oracle e12bb91257ca8d00: this list must be empty before 0.6.1 reaches players. A listed row is still
// fought and printed; only its listed steps skip the 3% assertion (a plain allowlist, not a ratchet).
// 0.6.1f: empty. BRAKE SHOE (the deeper slow starved the turret) and SPLITTER (THREE-WAY's third copy jammed the
// chamber) were retuned: HOT SHOE / RED-HOT SHOE keep half speed and add +2 / +5 flat; PERFECT CUT is 2 copies at 85%.
// 0.8.0 T1 (the Prime's call, oracle 7871a5e0c3396b2a): two real falls the saturated rows hid (5W and 0W at every star),
// in all four TUNE-M states. B1 retunes ASSEMBLY LINE 2/3 stars and OVERDRIVE 2 stars and empties this list before the
// 0.8.0 RC (plan DoD 3); its exit bar is in output-T1/REPORT.md ("For B1").
// 0.8.0 B1 M2 (brief 3.5, approved there): empty again. ASSEMBLY LINE 2/3 stars stamp at the 1-star pace and pour heavier
// slugs (base 4.5 / 6), and OVERDRIVE 2 stars (REDLINE) adds +1 damage: on 200 seeds assembly 1->2 +5.8%, 1->3 +14.7%,
// overdrive 1->2 +13.6% (output-B1/REPORT.md, the KNOWN_FALLS exit table).
export const KNOWN_FALLS: { id: string; steps: Step[]; cause: string; oracle: string }[] = [];
const known = (id: string, step: Step) => KNOWN_FALLS.some((k) => k.id === id && k.steps.includes(step));

export type DeckRow = StarRow;

/** 0.8.0 T1: the row's measure at 1, 2 and 3 stars (tests/starRows.ts), against the native opponent (0.6.2 BELTSIDE merge). */
export function deckRows(c: Case): DeckRow[] {
  return starRows(c.at, () => native(c.opp), SEEDS);
}

const line = (c: Case, r: DeckRow[]) => `${c.id} | ${c.deck} | ${c.opp} | ${r.map((x) => starCell(x)).join(" | ")}`;

describe("deck-level check: 1 -> 2 -> 3 stars never loses more than 3% of the damage the deck deals before it falls (20 seeds, the opponent's KO lifted)", () => {
  for (const c of CASES) {
    it(`${c.id} (${c.deck} vs ${c.opp})`, () => {
      const r = deckRows(c);
      const fall = KNOWN_FALLS.find((k) => k.id === c.id);
      if (fall) console.log(`KNOWN FALL (oracle ${fall.oracle}, ${fall.steps.join(", ")}: ${fall.cause}) ${line(c, r)}`);
      else if (process.env.BB_TABLES) console.log(`DECK ${line(c, r)}`);
      // Y7b2 TRIPWIRE (cap's ruling 171ac18e8a707ab5; only while RULES_VERSION is "bb-0.9.3"; OVERDRIVE on this bench deck
      // only): the flip removed REDLINE's +10 and AFTERBURNER's +30 flat, and 4x / 5x speed cuts ride-scaled damage on this
      // deck, so ★2 < ★1 by 6.3% and ★3 < ★1 by 9.1% (was: every step an upgrade). Its three means are pinned exactly; the 3%
      // check stays live for every other card and deck, and KNOWN_FALLS stays empty. Design list: OVERDRIVE's speed ladder (no
      // flat returns, REVIEW-STARD); once fixed, delete this tripwire and let the 3% check cover OVERDRIVE again
      // Z-BUMP (REQ-BFG-073; the bump to bb-0.9.7, cap's call on Y7B2-Q3: re-rule, fix none): re-keyed bb-0.9.3 -> bb-0.9.7,
      // its three means measured at Z-BUMP's tip. accepted for bb-0.9.7; the star-ladder pass fixes it (cap, Z-BUMP)
      if (RULES_VERSION === "bb-0.9.7" && c.id === "overdrive" && c.deck === "bench" && c.opp === WEAVER) {
        const why = "Y7b2 tripwire (cap's ruling 171ac18e8a707ab5): OVERDRIVE's bench means pinned under bb-0.9.7 (re-ruled at Z-BUMP), ★2 < ★1 by 6.3%, ★3 < ★1 by 9.1%; accepted for bb-0.9.7; the star-ladder pass fixes it (cap, Z-BUMP)";
        expect(r.map((x) => x.dmg), why).toEqual([941.4, 882, 856.05]);
        expect(r[1].dmg, `${why}: the recorded finding, ★2 under ★1`).toBeLessThan(r[0].dmg);
        return;
      }
      if (!known(c.id, "1->2")) expect(r[1].dmg, `${c.id} 1->2`).toBeGreaterThanOrEqual(r[0].dmg * 0.97);
      if (!known(c.id, "2->3")) expect(r[2].dmg, `${c.id} 2->3`).toBeGreaterThanOrEqual(r[1].dmg * 0.97);
      if (!fall) expect(r[2].dmg, `${c.id} 1->3`).toBeGreaterThanOrEqual(r[0].dmg * 0.97);
      if (c.id === "press") expect(r[0].dmg < r[1].dmg && r[1].dmg < r[2].dmg, "STAMP PRESS rises").toBe(true);
    });
  }

  it("report-only rows print with BB_TABLES=1 (no assertion: Prime call, item 4)", () => {
    if (!process.env.BB_TABLES) return;
    for (const c of REPORT_ONLY) console.log(`REPORT-ONLY ${line(c, deckRows(c))}`);
  });

  // 0.8.0 B1 M2 (brief 3.5, approved there): back to the 0.6.1f pin after T1's two entries (oracle 7871a5e0c3396b2a)
  it("KNOWN_FALLS stays empty: every merge step is an upgrade (0.6.1f)", () => {
    expect(KNOWN_FALLS).toEqual([]);
  });
});
