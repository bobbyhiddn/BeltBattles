// NUM-1 (REQ-BFG-047, N1 section 2.1): the checker of the scripted x10 (scripts/num1-scale.mjs). The script recorded the
// base's values in tests/fixtures/num1-base-values.json before it scaled them. Here every damage-family value ("x10") must
// be 10x its recorded base (N1's two non-whole ones rounded half up), every other value ("same": counts, gold, tiles, %,
// ratios, time) its recorded base, and every numeric field of the scaled tables must be in the fixture, so a piece added
// on a new base without re-running the script fails here.
// NUM-2 (REQ-BFG-047): the "same" values NUM-2 converted (intervals -> speed, multipliers -> rate %) left their base on
// purpose: they are handed off, row for row, to NUM-2's record tests/fixtures/num2-base-intervals.json and its checkers.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AMMO, FRAY_BONUS, HEROES, ITEMS, WAVE3_IDS, WAVE3_ITEMS } from "../src/sim/content"; // FLIP-X2: withSustain no longer read
import { PENDULUM, RACE_AMMO, RACE_HEROES, RACE_ITEMS } from "../src/sim/races/data";
import { PLATE_CAP, PLATE_PER_SLUG } from "../src/sim/races/bastion";
import { ECHO_CAP } from "../src/sim/races/siphon";
import { RUNE_LIST } from "../src/sim/runes"; // FLIP-X2: runeList no longer read
import { SUSTAIN_RUNE_LIST } from "../src/sim/runes"; // FLIP-X2: the 8 sustain runes' defs (2 dormant, out of runeList())
import { SABOTAGE_HULL } from "../src/game/road";
import { HULL_FLOOR } from "../src/net/roadCap";
import { EQ, MEAN_PLATE, MEAN_PLATE_OTHER, ROUND_EQ } from "../src/sim/deckRating";
import { P1_WAVE3_ITEMS } from "../tools/wave3Defs";
import { withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): the star-ladder pass's rows, off and on
import { withShapes } from "../src/sim/shapes"; // SHAPES-1 flip: the reshape's moved row and the shaped rigs' fields, off and on
import { withGuard } from "../src/sim/guard"; // HULL-ON (the flip, GUARD): RETUNE-1's rows, off and on
import { withOpenRunes } from "../src/sim/openRunes"; // HULL-ON (the flip, OPEN_RUNES): THE LONG ROAD's rewrite, off and on
import { withFreeJoins } from "../src/sim/freeJoins"; // HULL-ON run 6 (FREE_JOINS_HULL): WEAVER's hull, off and on

interface Row { file: string; id: string; rule: "x10" | "same"; base: number; now: number; rounded?: boolean }
const fixture = JSON.parse(readFileSync(new URL("./fixtures/num1-base-values.json", import.meta.url), "utf8")) as
  { sentinel: { FRAY_BONUS: number }; rounded: Record<string, number>; values: Row[];
    rules: { spec: Record<string, string>; ammo: Record<string, string>; heroes: Record<string, string> } };
const rows = fixture.values;
const byId = new Map(rows.map((r) => [r.id, r]));

// NUM-2 (REQ-BFG-047): scripts/num2-speed.mjs (4db2ed0) turned every turret's fireInterval and factory's interval into a
// whole speed (per 30 s) and every interval multiplier into a whole rate %, renaming the field (fireInterval, interval ->
// speed; mod.fireMul, core.intervalMul -> fireRate; factory.intervalMul -> rate; core.floor -> top; core.start,
// steamPlated, steamBare keep their names), after recording each base in tests/fixtures/num2-base-intervals.json: a row's
// path is the NUM-1 id of the old field. NUM-2's checkers check the converted values: numbers.speed (every speed from its
// base), belts.numbers (the signature FACTORY levels), numbers.percent (the rate %s).
interface Num2Row { file: string; path: string; field: string; to: string; kind: "speed" | "rate"; base: number; value: number }
const num2 = (JSON.parse(readFileSync(new URL("./fixtures/num2-base-intervals.json", import.meta.url), "utf8")) as { rows: Num2Row[] }).rows;
const num2At = new Map(num2.map((q) => [q.path, q])); // by the old field's id (a NUM-1 id)
const toPath = (q: Num2Row): string => [...q.path.split(".").slice(0, -1), q.to].join(".");
const num2To = new Map(num2.map((q) => [toPath(q), q])); // by the new field's id (the live one)

// SUS-A (REQ-BFG-069): RIVETER's gate.repair is gate.heal now, the same values under the new name (6 / 13 / 21). A fixture
// row at the old path is checked at the new one, and the scan's new path counts as its old row; nothing else moves.
const SUSA_RENAMED: readonly [string, string][] = [[".gate.repair", ".gate.heal"]];
const susaNew = (id: string): string => SUSA_RENAMED.reduce((s, [from, to]) => (s.endsWith(from) ? s.slice(0, -from.length) + to : s), id);
const susaOld = (id: string): string => SUSA_RENAMED.reduce((s, [from, to]) => (s.endsWith(to) ? s.slice(0, -to.length) + from : s), id);

// NUM-3 (REQ-BFG-046, REQ-BFG-047; 9dd6571 R1's STUN fold, 1337c43 N1 2.2's whole seconds): NUM-3 moved no damage-family
// value. The fixture stays NUM-1's record (it has no re-record switch: scripts/num1-scale.mjs run again would scale again),
// so, as NUM-2 and SUS-A did, the "same" rows NUM-3 moved are classified here row for row and checked at their NUM-3
// value instead of their recorded one; every other row keeps its check. Measured at 01bb1f8, 26 rows:
//  - "time" (20): the field kept, its value N1 2.2's whole seconds (ROTARY's window 0.75 s: LOAD 50% SHORTER): GALVANIC
//    COIL's and HOT SWAP's shockTime, FROSTBITE's and DRAG CHAIN's round.seconds (a STUN's seconds since the fold; DRAG
//    CHAIN's were the belt slow's), LIMPET ★3's stall, SURGE ★2's period, OVERCLOCKER's rest, STATIC BRUSH's staticTime,
//    TESLA ARC's stall, ROTARY BREECH's windowTime
//  - "gone" (3): DRAG CHAIN's round.mul, the chain slow's multiplier (its rounds STUN now; the field is gone)
//  - "reshaped" (3): BELLOWS' burnPerRide.seconds (1 BURN every n s) is { burn, per } (burn BURN for each per s ridden;
//    its max rows are unchanged and keep their check), each live at its two new fields
// NUM-3's numeric fields with no NUM-1 row (BELLOWS' burn and per, and SABOT's round.seconds, "added": its one STUN, was
// 5 / 4 / 3 s by part inside battle.ts) count as NUM-3's in the scan below, each checked live.
type Num3Row = { was: number } & ({ kind: "time"; now: number } | { kind: "gone" } | { kind: "reshaped"; now: Record<string, number> });
const NUM3_MOVED: Record<string, Num3Row> = {
  "ITEMS.hotswap.levels.2.factory.cycle.1.shockTime": { was: 1.8, kind: "time", now: 2 },
  "ITEMS.hotswap.levels.3.factory.cycle.1.shockTime": { was: 2.8, kind: "time", now: 3 },
  "ITEMS.frostbite.factory.round.seconds": { was: 2.5, kind: "time", now: 2 },
  "ITEMS.frostbite.levels.2.factory.round.seconds": { was: 2.75, kind: "time", now: 3 },
  "ITEMS.dragchain.factory.round.mul": { was: 0.6, kind: "gone" },
  "ITEMS.dragchain.factory.round.seconds": { was: 3, kind: "time", now: 1 },
  "ITEMS.dragchain.levels.2.factory.round.mul": { was: 0.4, kind: "gone" },
  "ITEMS.dragchain.levels.2.factory.round.seconds": { was: 4.4, kind: "time", now: 2 },
  "ITEMS.dragchain.levels.3.factory.round.mul": { was: 0.3, kind: "gone" },
  "ITEMS.dragchain.levels.3.factory.round.seconds": { was: 6, kind: "time", now: 3 }, // FLIP-X2 (REVIEW-NUM3 F1): 2 -> 3
  "ITEMS.limpet.levels.3.factory.round.stall": { was: 1.6, kind: "time", now: 2 },
  "ITEMS.coil.levels.2.gate.shockTime": { was: 1.8, kind: "time", now: 2 },
  "ITEMS.coil.levels.3.gate.shockTime": { was: 2.8, kind: "time", now: 3 },
  "ITEMS.surge.levels.2.gate.pulse.period": { was: 2.5, kind: "time", now: 3 },
  "ITEMS.overclocker.levels.2.gate.overclockCooldown": { was: 1.8, kind: "time", now: 2 },
  "ITEMS.overclocker.levels.3.gate.overclockCooldown": { was: 1.15, kind: "time", now: 1 },
  "ITEMS.bellows.gate.burnPerRide.seconds": { was: 2.5, kind: "reshaped", now: { burn: 4, per: 10 } },
  "ITEMS.bellows.levels.2.gate.burnPerRide.seconds": { was: 1.15, kind: "reshaped", now: { burn: 9, per: 10 } },
  "ITEMS.bellows.levels.3.gate.burnPerRide.seconds": { was: 0.7, kind: "reshaped", now: { burn: 14, per: 10 } },
  "ITEMS.staticbrush.gate.staticTime": { was: 0.6, kind: "time", now: 1 },
  "ITEMS.staticbrush.levels.2.gate.staticTime": { was: 1.3, kind: "time", now: 2 },
  "ITEMS.staticbrush.levels.3.gate.staticTime": { was: 2.1, kind: "time", now: 3 },
  "ITEMS.rotary.core.windowTime": { was: 0.8, kind: "time", now: 0.75 },
  "ITEMS.tesla.core.stall": { was: 0.8, kind: "time", now: 1 },
  "ITEMS.tesla.levels.2.core.stall": { was: 0.9, kind: "time", now: 1 },
  "ITEMS.tesla.levels.3.core.stall": { was: 0.93, kind: "time", now: 1 },
};
const NUM3_ADDED: Record<string, number> = { "ITEMS.sabot.factory.round.seconds": 4, "ITEMS.sabot.levels.3.factory.round.seconds": 4 };
// Y7b2 (the flip): NUM-3's rows and fields release Y moved again: HOT SWAP ★2/★3's spark STUN 2/3 -> 3/4 s (DESIGN-Y row 12),
// LIMPET ★3's stall gone (row 13), BELLOWS' burn/per 4/10, 9/10, 14/10 -> 1/2, 2/2, 3/2 (row 22), SABOT ★3's own round gone
// (row 11: ★3 inherits ★1's 4 s round). Each is checked at its release-Y value (undefined: no field). Cause: the flip
const Y7B2_NUM3: Record<string, number | undefined> = {
  "ITEMS.hotswap.levels.2.factory.cycle.1.shockTime": 3, "ITEMS.hotswap.levels.3.factory.cycle.1.shockTime": 4,
  "ITEMS.limpet.levels.3.factory.round.stall": undefined,
  "ITEMS.bellows.gate.burnPerRide.burn": 1, "ITEMS.bellows.gate.burnPerRide.per": 2,
  "ITEMS.bellows.levels.2.gate.burnPerRide.burn": 2, "ITEMS.bellows.levels.2.gate.burnPerRide.per": 2,
  "ITEMS.bellows.levels.3.gate.burnPerRide.burn": 3, "ITEMS.bellows.levels.3.gate.burnPerRide.per": 2,
  "ITEMS.sabot.levels.3.factory.round.seconds": undefined,
};
/** Y7b2: NUM-3's value at `id`, or its release-Y value where the flip moved it again (Y7B2_NUM3). */
const y3 = (id: string, v: number): number | undefined => (id in Y7B2_NUM3 ? Y7B2_NUM3[id] : v);
/** The id of the field `name` beside fixture id `id` (BELLOWS' burnPerRide.seconds -> burnPerRide.burn). */
const sibling = (id: string, name: string): string => [...id.split(".").slice(0, -1), name].join(".");
/** NUM-3's new numeric fields (no NUM-1 row), id -> its value: the reshaped rows' new fields and the added ones. */
const num3New = new Map<string, number>([
  ...Object.entries(NUM3_MOVED).flatMap(([id, m]) =>
    m.kind === "reshaped" ? Object.entries(m.now).map(([k, v]): [string, number] => [sibling(id, k), v]) : []),
  ...Object.entries(NUM3_ADDED),
]);

// FLIP-X1 (F-d, SUS-D §9): the 8 sustain runes runeList() adds with the switch on (SUS-D) were born in N1 units, after
// NUM-1's script ran: no fixture row and no x10. The walk meets them as SUSTAIN_RUNES.<id>.amount.n, classified here as
// N1-native (n1Native), each checked live below with its own pins. RUNE_LIST's rows and counts are as before.
// FLIP-X2 (REVIEW-TUNEX): runeList() never holds a dormant rune (DORMANT_RUNES), so with the switch on it adds 6 of the 8
// (SEARING and SHATTER SHOT dormant; tests/numbers.hull.test.ts pins that). Their defs and amounts stay, so the walk keeps
// all 8: runes.ts SUSTAIN_RUNE_LIST (was the runeList() difference, the same 8 before DORMANT_RUNES)
const SUSTAIN_RUNES = SUSTAIN_RUNE_LIST;
const n1Native = new Map(SUSTAIN_RUNES.map((d): [string, number] => [`SUSTAIN_RUNES.${d.id}.amount.n`, d.amount.n]));

// FLIP-X2 (REQ-BFG-058; TUNE-X lines 7, 9, 10, 11 and 14, REVIEW-TUNEX; flipx2 step 3b 8d714af): five RUNE_LIST amounts
// moved after NUM-1's record. No rule moved: an x10 row stays a whole x10-scale value, a "same" row a count. As NUM-3's
// rows, each is checked at its FLIP-X2 value instead of its recorded one; every other row keeps its check.
const TUNEX_MOVED: Record<string, { rule: "x10" | "same"; was: number; now: number }> = {
  "RUNE_LIST.twin_nails.amount.n": { rule: "x10", was: 20, now: 10 }, // TWIN NAILS (line 7)
  "RUNE_LIST.loose_thread.amount.n": { rule: "same", was: 3, now: 2 }, // LOOSE THREAD (line 9)
  "RUNE_LIST.grave_plates.amount.n": { rule: "x10", was: 120, now: 240 }, // GRAVE PLATES, theme bastion -> armor (line 10)
  "RUNE_LIST.molten_bond.amount.n": { rule: "x10", was: 40, now: 20 }, // MOLTEN BOND (line 11)
  "RUNE_LIST.tangle_wire.amount.n": { rule: "same", was: 6, now: 5 }, // TANGLE WIRE (line 14)
};

// Y-FURN (release Y; FURN-Y rows 1-2, REVIEW-FURNY): two more RUNE_LIST amounts moved after NUM-1's record, both "same"
// rows (a whole %), the fixture untouched. Each is checked at its release-Y value, as TUNEX_MOVED's are
const YFURN_MOVED: Record<string, { rule: "x10" | "same"; was: number; now: number }> = {
  // BAL-2 (cap's REVIEW-BAL1 rows 3-4): each is live at 0.9.1's amount (was now: 20 and 40)
  "RUNE_LIST.coal_chute.amount.n": { rule: "same", was: 25, now: 15 }, // COAL CHUTE (row 1; it reads the KILN's HEAT too)
  "RUNE_LIST.heat_sink.amount.n": { rule: "same", was: 50, now: 25 }, // HEAT SINK (row 2)
};

// BAL-2 (REQ-BFG-069; cap's REVIEW-BAL1 rows 1, 7 and 8): three content.ts rows moved after NUM-1's record, all "x10"
// rows (the fixture untouched): the KILN's HEAT 12 -> 13 and the two hulls. No rule moved: each stays a whole value on
// the N1 scale. Each is checked at its 0.9.1 value, as TUNEX_MOVED's and YFURN_MOVED's are; every other row keeps its check
const BAL2_MOVED: Record<string, { rule: "x10" | "same"; was: number; now: number }> = {
  "AMMO.cinder.rideScale": { rule: "x10", was: 12, now: 13 }, // the KILN's HEAT (row 7)
  "HEROES.furnace.hull": { rule: "x10", was: 2000, now: 2100 }, // FURNACE's hull (row 8)
  "HEROES.weaver.hull": { rule: "x10", was: 1800, now: 1700 }, // WEAVER's hull (row 1)
};
// HULL-ON (bb-0.10.0, FREE_JOINS; REQ-BFG-091, REQ-BFG-092; src/sim/freeJoins.ts FREE_JOINS_HULL, cap's ruling
// 84ad10254e1855c8 = RULING-HULLON-R9 Q3, re-pinned by RULING-HULLON-R10 0bbcee55b6ba281a (a)): with free joins on, WEAVER's
// hull is FREE_JOINS_HULL's 1500 (still a whole x10 value); content.ts keeps BAL-2's 1700, live again with the switch off.
// So BAL2_MOVED's WEAVER row is checked at its free-joins value, and at BAL-2's with the switch off, as GUARD_MOVED's are.
// Cause: FREE_JOINS
const FJ_HULL_MOVED: Record<string, number> = { "HEROES.weaver.hull": 1500 };

// Y7b2 (release Y; REQ-BFG-070, REQ-BFG-046; BRIEF-Y7B2 steps 1 and 7): the flip folded release Y's one-line rules (the star
// switch's STAR_DIFF) into the base defs, which moved 98 rows after NUM-1's record: 39 to a release-Y value and 59 gone with
// their field (POISON, the floors and caps, the perk rules; EQ.poison and EQ.perStalled with the rating's off path), the
// fixture untouched. Each is checked at its release-Y value (`now`; undefined: no field), as BAL2_MOVED's are; every other
// row keeps its check. Measured on y7b2 (T/output-y7b2/diag/numscale-bad.json). Cause: the flip
// AZ-BUMP (REQ-BFG-070; TXT-AZ item 5, REVIEW-TXTAZ Q1, REVIEW-STAGE093 ruling 15, #370): BRACE FRAME's `plated`, unread
// since Y2 (Battle.braceCut reads mul only), is gone at every star from WAVE3_ITEMS and from tools/wave3Defs.ts's copy, so
// its 6 rows are gone with their field (`now` undefined, as Y7B2_MOVED's gone rows), the fixture untouched (NUM-1's
// record). Each is checked below at its recorded `was` and as gone; every other row keeps its check. Cause: TXT-AZ item 5
const ITEM5_MOVED: Record<string, { was: number; now: undefined }> = {
  "WAVE3_ITEMS.braceframe.gate.brace.plated": { was: 0.25, now: undefined },
  "WAVE3_ITEMS.braceframe.levels.2.gate.brace.plated": { was: 0.15, now: undefined },
  "WAVE3_ITEMS.braceframe.levels.3.gate.brace.plated": { was: 0.05, now: undefined },
  "P1_WAVE3_ITEMS.braceframe.gate.brace.plated": { was: 0.25, now: undefined },
  "P1_WAVE3_ITEMS.braceframe.levels.2.gate.brace.plated": { was: 0.15, now: undefined },
  "P1_WAVE3_ITEMS.braceframe.levels.3.gate.brace.plated": { was: 0.05, now: undefined },
};

const Y7B2_MOVED: Record<string, { was: number; now: number | undefined }> = {
  "ITEMS.hotswap.levels.2.factory.cycle.0.burn": { was: 4, now: 5 },
  "ITEMS.hotswap.levels.2.factory.cycle.1.jump": { was: 1, now: undefined },
  "ITEMS.hotswap.levels.3.factory.cycle.0.burn": { was: 7, now: 9 },
  "ITEMS.hotswap.levels.3.factory.cycle.1.jump": { was: 1, now: undefined },
  "ITEMS.assembly.levels.3.factory.hotStart": { was: 4, now: undefined },
  "ITEMS.limpet.factory.round.blast": { was: 80, now: 100 },
  "ITEMS.limpet.levels.2.factory.round.blast": { was: 180, now: 230 },
  "ITEMS.limpet.levels.2.factory.round.stall": { was: 1, now: undefined },
  "ITEMS.limpet.levels.3.factory.round.blast": { was: 280, now: 360 },
  "ITEMS.brake.levels.2.gate.speed": { was: 0.5, now: 0.4 },
  "ITEMS.brake.levels.2.gate.flat": { was: 20, now: undefined },
  "ITEMS.brake.levels.3.gate.speed": { was: 0.5, now: 0.3 },
  "ITEMS.brake.levels.3.gate.flat": { was: 50, now: undefined },
  "ITEMS.longhaul.levels.2.gate.priorCap": { was: 6, now: undefined },
  "ITEMS.longhaul.levels.3.gate.priorCap": { was: 6, now: undefined },
  "ITEMS.overdrive.levels.2.gate.flat": { was: 10, now: undefined },
  "ITEMS.overdrive.levels.3.gate.flat": { was: 30, now: undefined },
  "ITEMS.surge.gate.lockedFlat": { was: 30, now: undefined },
  "ITEMS.surge.levels.2.gate.lockedFlat": { was: 60, now: undefined },
  "ITEMS.surge.levels.3.gate.lockedFlat": { was: 100, now: undefined },
  "ITEMS.venom.gate.poison": { was: 2, now: undefined },
  "ITEMS.venom.levels.2.gate.poison": { was: 4, now: undefined },
  "ITEMS.venom.levels.3.gate.poison": { was: 7, now: undefined },
  "ITEMS.keg.gate.keg.burn": { was: 1, now: undefined },
  "ITEMS.keg.levels.2.gate.keg.burn": { was: 2, now: undefined },
  "ITEMS.keg.levels.3.gate.keg.burn": { was: 3, now: undefined },
  "ITEMS.bellows.gate.burnPerRide.max": { was: 4, now: undefined },
  "ITEMS.bellows.levels.2.gate.burnPerRide.max": { was: 9, now: undefined },
  "ITEMS.bellows.levels.3.gate.burnPerRide.max": { was: 14, now: undefined },
  "ITEMS.quench.gate.quench.flat": { was: 10, now: 0 },
  "ITEMS.quench.gate.quench.stacks": { was: 4, now: undefined },
  "ITEMS.quench.levels.2.gate.quench.flat": { was: 20, now: 0 },
  "ITEMS.quench.levels.2.gate.quench.stacks": { was: 5, now: undefined },
  "ITEMS.quench.levels.3.gate.quench.flat": { was: 30, now: 0 },
  "ITEMS.quench.levels.3.gate.quench.stacks": { was: 6, now: undefined },
  "ITEMS.lodestone.gate.flat": { was: 10, now: undefined },
  "ITEMS.lodestone.levels.2.gate.flat": { was: 20, now: undefined },
  "ITEMS.lodestone.levels.3.gate.flat": { was: 30, now: undefined },
  "ITEMS.barbed.levels.2.gate.frayCap": { was: 3, now: undefined },
  "ITEMS.barbed.levels.3.gate.frayCap": { was: 6, now: undefined },
  "ITEMS.counterweight.gate.perTile.each": { was: 5, now: 3 },
  "ITEMS.counterweight.gate.perTile.max": { was: 60, now: undefined },
  "ITEMS.counterweight.levels.2.gate.perTile.each": { was: 11, now: 7 },
  "ITEMS.counterweight.levels.2.gate.perTile.max": { was: 130, now: undefined },
  "ITEMS.counterweight.levels.3.gate.perTile.each": { was: 18, now: 11 },
  "ITEMS.counterweight.levels.3.gate.perTile.max": { was: 210, now: undefined },
  "ITEMS.chamber.levels.2.mod.perShot": { was: 2, now: 3 },
  "ITEMS.chamber.levels.2.mod.window": { was: 1, now: undefined },
  "ITEMS.chamber.levels.3.mod.perShot": { was: 3, now: 4 },
  "ITEMS.chamber.levels.3.mod.window": { was: 1, now: undefined },
  "ITEMS.spotter.levels.2.mod.factoryWeight": { was: 2, now: undefined },
  "ITEMS.spotter.levels.3.mod.factoryWeight": { was: 3, now: undefined },
  "ITEMS.hopper.mod.windowTime": { was: 0.5, now: undefined },
  "ITEMS.hopper.levels.2.mod.store": { was: 1, now: undefined },
  "ITEMS.hopper.levels.3.mod.store": { was: 2, now: undefined },
  "ITEMS.mantlet.levels.2.mod.intakeGuard": { was: 1, now: 2 },
  "ITEMS.drake.core.flatPerBurn": { was: 20, now: 25 },
  "ITEMS.drake.core.addBurn": { was: 1, now: undefined },
  "ITEMS.drake.core.burnTime": { was: 4, now: undefined },
  "ITEMS.drake.core.flightMul": { was: 0.7, now: undefined },
  "ITEMS.drake.levels.2.core.flatPerBurn": { was: 15, now: 18 },
  "ITEMS.drake.levels.2.core.addBurn": { was: 2, now: undefined },
  "ITEMS.drake.levels.2.core.burnTime": { was: 5, now: undefined },
  "ITEMS.drake.levels.3.core.flatPerBurn": { was: 10, now: 13 },
  "ITEMS.drake.levels.3.core.addBurn": { was: 3, now: undefined },
  "ITEMS.drake.levels.3.core.burnTime": { was: 6, now: undefined },
  "ITEMS.capacitor.core.maxSeconds": { was: 5, now: undefined },
  "WAVE3_ITEMS.twingauge.gate.gauge.flat": { was: 10, now: 0 },
  "WAVE3_ITEMS.twingauge.levels.2.gate.gauge.flat": { was: 22, now: 0 },
  "WAVE3_ITEMS.twingauge.levels.3.gate.gauge.flat": { was: 35, now: 0 },
  "WAVE3_ITEMS.pincer.gate.pincer.flat": { was: 10, now: 0 },
  "WAVE3_ITEMS.pincer.gate.pincer.max": { was: 3, now: undefined },
  "WAVE3_ITEMS.pincer.levels.2.gate.pincer.flat": { was: 22, now: 0 },
  "WAVE3_ITEMS.pincer.levels.2.gate.pincer.max": { was: 3, now: undefined },
  "WAVE3_ITEMS.pincer.levels.3.gate.pincer.flat": { was: 35, now: 0 },
  "WAVE3_ITEMS.pincer.levels.3.gate.pincer.max": { was: 3, now: undefined },
  "WAVE3_ITEMS.twinlatch.gate.latch.flat": { was: 10, now: 0 },
  "WAVE3_ITEMS.twinlatch.levels.2.gate.latch.hold": { was: 1, now: 2 },
  "WAVE3_ITEMS.twinlatch.levels.2.gate.latch.flat": { was: 22, now: 0 },
  "WAVE3_ITEMS.twinlatch.levels.3.gate.latch.hold": { was: 1, now: 3 },
  "WAVE3_ITEMS.twinlatch.levels.3.gate.latch.flat": { was: 35, now: 0 },
  "WAVE3_ITEMS.platebreaker.gate.breaker.floor": { was: 10, now: 0 },
  "WAVE3_ITEMS.platebreaker.levels.2.gate.breaker.floor": { was: 22, now: 0 },
  "WAVE3_ITEMS.platebreaker.levels.3.gate.breaker.floor": { was: 35, now: 0 },
  "WAVE3_ITEMS.twintrigger.mod.pairBonus": { was: 0.25, now: 0.3 },
  "WAVE3_ITEMS.twintrigger.mod.windowTime": { was: -0.25, now: undefined },
  "WAVE3_ITEMS.twintrigger.levels.2.mod.pairBonus": { was: 0.55, now: 0.6 },
  "WAVE3_ITEMS.twintrigger.levels.2.mod.windowTime": { was: -0.4, now: undefined },
  "WAVE3_ITEMS.twintrigger.levels.3.mod.pairBonus": { was: 0.88, now: 0.95 },
  "WAVE3_ITEMS.twintrigger.levels.3.mod.windowTime": { was: -0.55, now: undefined },
  "WAVE3_ITEMS.spallcatcher.mod.spall.max": { was: 80, now: undefined },
  "WAVE3_ITEMS.spallcatcher.levels.2.mod.spall.max": { was: 176, now: undefined },
  "WAVE3_ITEMS.spallcatcher.levels.3.mod.spall.max": { was: 280, now: undefined },
  "WAVE3_ITEMS.seamwelder.mod.seam.lone": { was: 2, now: 0 },
  "WAVE3_ITEMS.seamwelder.levels.2.mod.seam.lone": { was: 4, now: 0 },
  "WAVE3_ITEMS.seamwelder.levels.3.mod.seam.lone": { was: 7, now: 0 },
  "EQ.poison": { was: 30, now: undefined },
  "EQ.perStalled": { was: 1.5, now: undefined },
};
// Y7b2: NUM-2's live fields the flip moved (NUM-2's record untouched): SABOT ★3's SPEED 16 -> 20 (a handed-off NUM-1 row, so
// the hand-off check reads it here), ROTARY ★2/★3's fireRate gone (its load time is the star's number), STEAM BREECH's
// steamBare gone and its steamPlated 35/70/110 -> 40/80/120 (NUM-2's checkers check those values). Cause: the flip
const Y7B2_NUM2: Record<string, { was: number; now: number | undefined }> = {
  "ITEMS.sabot.levels.3.factory.speed": { was: 16, now: 20 },
  "ITEMS.rotary.levels.2.core.fireRate": { was: 18, now: undefined },
  "ITEMS.rotary.levels.3.core.fireRate": { was: 43, now: undefined },
  "WAVE3_ITEMS.steambreech.core.steamPlated": { was: 35, now: 40 },
  "WAVE3_ITEMS.steambreech.levels.2.core.steamPlated": { was: 70, now: 80 },
  "WAVE3_ITEMS.steambreech.levels.3.core.steamPlated": { was: 110, now: 120 },
  "WAVE3_ITEMS.steambreech.core.steamBare": { was: 10, now: undefined },
  "WAVE3_ITEMS.steambreech.levels.2.core.steamBare": { was: 20, now: undefined },
  "WAVE3_ITEMS.steambreech.levels.3.core.steamBare": { was: 30, now: undefined },
};
// Y7b2: the numeric fields the flip added that NUM-1's script never met, each classified and checked live below: LIMPET
// WORKS' factory.base 0 (its charge's 20 joined the blast: a damage field, whole on the x10 scale as built) and VENOM DRIP's
// gate.burnPlus +3/+6/+9 s (a time, N1-native). Cause: the flip
const Y7B2_ADDED: Record<string, number> = {
  "ITEMS.limpet.factory.base": 0, "ITEMS.venom.gate.burnPlus": 3, "ITEMS.venom.levels.2.gate.burnPlus": 6, "ITEMS.venom.levels.3.gate.burnPlus": 9,
};
// AZ-BUMP (the flip, LADDER_FIX; REQ-BFG-070, the star-ladder pass, src/sim/ladderFix.ts): with the switch on, ITEMS holds the
// pass's fixed defs, which moved one row after NUM-1's record, the fixture untouched (NUM-1's record): QUENCH TANK ★1's
// perBurn 30 -> 40 (an x10 row, still whole; ★1 paid exactly a BURN's own damage). It is checked at its fixed value, and at
// its recorded one with the switch off, as BAL2_MOVED's are; every other row keeps its check. OVERDRIVE ★2/★3's rideKeep
// 0.5 / 1 are fields the pass added that NUM-1's script never met (a share of the ride, N1-native, no x10), classified here
// and checked live below, as Y7B2_ADDED's are. STOKER ★3's stoke 0.85 meets no row: the fixture records wave 3 under
// WAVE3_ITEMS and P1_WAVE3_ITEMS, which the pass leaves as written (it swaps ITEMS.stoker alone, and the scan below skips
// ITEMS' wave-3 ids). Cause: LADDER_FIX
const LADDER_MOVED: Record<string, { rule: "x10" | "same"; was: number; now: number }> = {
  "ITEMS.quench.gate.quench.perBurn": { rule: "x10", was: 30, now: 40 },
};
const LADDER_ADDED: Record<string, number> = { "ITEMS.overdrive.levels.2.gate.rideKeep": 0.5, "ITEMS.overdrive.levels.3.gate.rideKeep": 1 };
// HULL-ON (the flip, GUARD; REQ-BFG-097, RETUNE-1 run 2, src/sim/guard.ts GUARD_RUNES): with the switch on, the common PLATE
// runes' amounts are RETUNE-1's, which moved three runes.ts rows after NUM-1's record, the fixture untouched: RIVET HOARD
// 60 -> 180, LAST WALL 80 -> 140, SEAM RIVETS 10 -> 30 (x10 rows, still whole). Each is checked at its guarded value, and at
// its recorded one with the switch off, as LADDER_MOVED's are. WARD BELL's SHIELD cadence (a SUSTAIN_N1 field, no fixture
// row) is the guarded def's too: 8 / 5 / 4 -> 4 / 2.5 / 2 s (GUARD_SUSTAIN, checked below, SUSTAIN_N1's with the switch off);
// HULL-ON run 5 (GUARD; cap's ruling 22e26ded338944ea Q6, ruling 19139b4c41a1636f): ★2 rounded to 3, so 4 / 3 / 2 s
const GUARD_MOVED: Record<string, { rule: "x10" | "same"; was: number; now: number }> = {
  "RUNE_LIST.rivet_hoard.amount.n": { rule: "x10", was: 60, now: 180 },
  "RUNE_LIST.last_wall.amount.n": { rule: "x10", was: 80, now: 140 },
  "RUNE_LIST.seam_rivets.amount.n": { rule: "x10", was: 10, now: 30 },
};
const GUARD_SUSTAIN: Record<string, number> = {
  "ITEMS.wardbell.mod.shield.every": 4, "ITEMS.wardbell.levels.2.mod.shield.every": 3, "ITEMS.wardbell.levels.3.mod.shield.every": 2,
};
// HULL-ON (the flip, OPEN_RUNES; REQ-BFG-109, src/sim/openRunes.ts OPEN_RUNE_DEFS): with the switch on, THE LONG ROAD is
// OPEN-1's rewrite in the catalogue ("+6% DMG PER RIG A LOAD PASSES", LONG_ROAD_PCT; was "YOUR RIDE BONUS: x2"), which moved
// one runes.ts row after NUM-1's record, the fixture untouched: 2 -> 6 (a "same" row, a whole %). It is checked at its open
// value, and at its recorded one with the switch off (the base def back in RUNE_LIST)
const OPEN_MOVED: Record<string, { rule: "x10" | "same"; was: number; now: number }> = {
  "RUNE_LIST.long_road.amount.n": { rule: "same", was: 2, now: 6 },
};
// SHAPES-1 flip (REQ-BFG-086; src/sim/shapes.ts, SHAPES on): with the switch on ITEMS holds ASSEMBLY LINE's reshaped def (I3,
// 1 G less: SHAPE_DEFS), which moved one row after NUM-1's record, the fixture untouched (NUM-1's record; the script can't
// re-record, it would scale again): its price 5 -> 4 (a "same" row, gold). It is checked at its SHAPES value, and at its
// recorded one with the switch off, as LADDER_MOVED's is; GANTRY PRESS's reshape moves no number (its foot is a string, its
// 4/5/6 slots foot.ts footSlots). The three shaped plain rigs (SHAPES_ITEMS) were born on the N1 scale after NUM-1's script
// ran (NAIL STRIP 12/25/40 and SPIKE RAIL 10/20/35 DAMAGE, whole), so their 6 damage fields have no fixture row and no x10:
// N1-native, classified here and checked live below, as SUSTAIN_N1's and LADDER_ADDED's are (their price, size and EMBER
// TROUGH's BURN counts are "same" fields, waved through as every other one). With the switch off none exists. Cause: SHAPES
const SHAPES_MOVED: Record<string, { rule: "x10" | "same"; was: number; now: number }> = {
  "ITEMS.assembly.price": { rule: "same", was: 5, now: 4 },
};
const SHAPES_ADDED: Record<string, number> = {
  "ITEMS.nailstrip.gate.flat": 12, "ITEMS.nailstrip.levels.2.gate.flat": 25, "ITEMS.nailstrip.levels.3.gate.flat": 40,
  "ITEMS.spikerail.gate.flat": 10, "ITEMS.spikerail.levels.2.gate.flat": 20, "ITEMS.spikerail.levels.3.gate.flat": 35,
};

// FLIP-X2 (REQ-BFG-069, the sustain switch on): ITEMS lists WARD BELL, MEND PRESS and MENDING LOOM now, so the walk meets
// their numeric fields. SUS-A wrote them after NUM-1's script and NUM-2's (content.ts SUSTAIN_ITEMS: "on the N1 scale",
// MEND PRESS's speeds ARMOR PRESS's whole ones), so, as the sustain runes, no fixture row and no x10: N1-native, each
// classified here and checked live below (their price and size are "same" fields, checked as every other one)
const SUSTAIN_N1: Record<string, number> = {
  "ITEMS.wardbell.mod.shield.every": 8, "ITEMS.wardbell.mod.shield.amount": 1,
  "ITEMS.wardbell.levels.2.mod.shield.every": 5, "ITEMS.wardbell.levels.2.mod.shield.amount": 1,
  "ITEMS.wardbell.levels.3.mod.shield.every": 4, "ITEMS.wardbell.levels.3.mod.shield.amount": 1,
  "ITEMS.mendpress.factory.speed": 19, "ITEMS.mendpress.factory.heal.every": 3, "ITEMS.mendpress.factory.heal.amount": 20,
  "ITEMS.mendpress.levels.2.factory.speed": 21, "ITEMS.mendpress.levels.2.factory.heal.every": 3, "ITEMS.mendpress.levels.2.factory.heal.amount": 30,
  "ITEMS.mendpress.levels.3.factory.speed": 25, "ITEMS.mendpress.levels.3.factory.heal.every": 3, "ITEMS.mendpress.levels.3.factory.heal.amount": 45,
  "ITEMS.mendingloom.mod.regen": 10, "ITEMS.mendingloom.levels.2.mod.regen": 15, "ITEMS.mendingloom.levels.3.mod.regen": 20,
};
const sustainNative = new Map(Object.entries(SUSTAIN_N1));

const TABLES: Record<string, unknown> = {
  FRAY_BONUS, ITEMS, WAVE3_ITEMS, AMMO, HEROES, RACE_ITEMS, RACE_AMMO, RACE_HEROES, PENDULUM, PLATE_PER_SLUG, PLATE_CAP, ECHO_CAP,
  RUNE_LIST: Object.fromEntries(RUNE_LIST.map((d) => [d.id, d])), SABOTAGE_HULL, HULL_FLOOR, EQ, ROUND_EQ, MEAN_PLATE,
  MEAN_PLATE_OTHER, P1_WAVE3_ITEMS,
  SUSTAIN_RUNES: Object.fromEntries(SUSTAIN_RUNES.map((d) => [d.id, d])), // FLIP-X1 (F-d)
};

/** A value the module doesn't export, read from its source: ghostSnapshot.ts's hullBonus bounds, the road events' hull deltas
 *  (EVENTS.<event>.<choice label>.<cost|gain>.hull: the `{ k: "hull", n }` on the line of that label). */
function fromSource(row: Row): number | undefined {
  const text = readFileSync(new URL(`../${row.file}`, import.meta.url), "utf8");
  if (row.id.startsWith("EVENTS.")) {
    const [, , label, side] = row.id.split(".");
    const line = text.split("\n").find((l) => l.includes(`label: "${label}"`));
    const part = line?.split(`${side}: [`)[1];
    const m = part?.match(/\{ k: "hull", n: (-?[\d.]+) \}/);
    return m ? Number(m[1]) : undefined;
  }
  const m = text.match(new RegExp(`\\b${row.id} = (-?[\\d.]+)`));
  return m ? Number(m[1]) : undefined;
}

/** The live value at a fixture id ("ITEMS.press.levels.3.factory.base"). */
function live(id: string): unknown {
  const row = byId.get(id);
  if (row && (id.startsWith("EVENTS.") || id.startsWith("HULL_BONUS_") || id === "PLATE")) return fromSource(row);
  const [table, ...path] = id.split(".");
  let v: unknown = TABLES[table];
  for (const k of path) v = v === undefined || v === null ? undefined : (v as Record<string, unknown>)[k];
  return v;
}

/** Every numeric leaf of a live table, as fixture ids (functions, strings and booleans skipped). */
function numericLeaves(prefix: string, v: unknown, out: string[] = []): string[] {
  if (typeof v === "number") out.push(prefix);
  else if (Array.isArray(v)) v.forEach((x, i) => numericLeaves(`${prefix}.${i}`, x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) numericLeaves(`${prefix}.${k}`, x, out);
  return out;
}

describe("NUM-1 scripted x10 (tests/fixtures/num1-base-values.json)", () => {
  it("the fixture is the script's record: x10 rows are 10x the base, whole; same rows are the base", () => {
    expect(fixture.sentinel.FRAY_BONUS).toBe(0.2);
    expect(rows.length).toBeGreaterThan(800);
    for (const r of rows) {
      if (r.rule === "same") expect(r.now, r.id).toBe(r.base);
      else {
        expect(Number.isInteger(r.now), r.id).toBe(true);
        const exact = Math.round(r.base * 10 * 1e6) / 1e6; // the base x 10 without float noise
        if (r.rounded) expect(r.now, r.id).toBe(Math.floor(exact + 0.5));
        else expect(r.now, r.id).toBe(exact);
      }
    }
  });

  it("only N1's two values round: COUNTERWEIGHT ★3 1.75 -> 18 and ANVIL ★3 8.75 -> 88 (and the dev pages' copy of ANVIL)", () => {
    expect(rows.filter((r) => r.rounded).map((r) => [r.id, r.base, r.now])).toEqual([
      ["ITEMS.counterweight.levels.3.gate.perTile.each", 1.75, 18],
      ["WAVE3_ITEMS.anvil.levels.3.core.anvilFlat", 8.75, 88],
      ["P1_WAVE3_ITEMS.anvil.levels.3.core.anvilFlat", 8.75, 88],
    ]);
  });

  it("every recorded value is live: x10 rows at 10x the base, same rows unchanged", () => {
    // NUM-2 (REQ-BFG-047): a row NUM-2 converted (its id is a num2-base-intervals.json path) left its base on purpose, so
    // instead of its base here it is handed off to NUM-2, exactly: a "same" row (no damage-family value is handed off) of
    // the same file whose base is NUM-2's recorded base, and NUM-2's converted value is live under the field's new name.
    // Every other row keeps its check, unchanged.
    const handed = rows.filter((r) => num2At.has(r.id));
    for (const r of handed) {
      const q = num2At.get(r.id)!;
      expect([r.rule, r.file, r.base], r.id).toEqual(["same", q.file, q.base]);
      // Y7b2: a NUM-2 field the flip moved reads its release-Y value (Y7B2_NUM2: SABOT ★3 20; ROTARY ★2/★3's fireRate gone)
      expect(live(toPath(q)), toPath(q)).toBe(toPath(q) in Y7B2_NUM2 ? Y7B2_NUM2[toPath(q)].now : q.value);
    }
    // NUM-2 (REQ-BFG-047): measured, 129 rows handed off: NUM-2's 114 speeds and 15 of its 27 rate %s (the other 12,
    // STEAM BREECH's steamPlated / steamBare, were never NUM-1 rows: 1 / 1.35 is not a literal; the scan below)
    expect([handed.length, handed.filter((r) => num2At.get(r.id)!.kind === "speed").length]).toEqual([129, 114]);
    // NUM-3: a row NUM-3 moved (NUM3_MOVED) is checked at its NUM-3 value below instead of its recorded one
    // FLIP-X2: and a row TUNE-X moved (TUNEX_MOVED, the 5 rune amounts) at its FLIP-X2 value below
    // Y-FURN: and a row FURN-Y moved (YFURN_MOVED, COAL CHUTE and HEAT SINK) at its release-Y value below (was each live at
    // its recorded value, 25 and 50)
    // BAL-2: and a row BAL-2 moved (BAL2_MOVED: the KILN's HEAT and the two hulls) at its 0.9.1 value below
    // AZ-BUMP: and a row TXT-AZ item 5 removed (ITEM5_MOVED: BRACE FRAME's plated) as gone below
    // AZ-BUMP (the flip, LADDER_FIX): and a row the star-ladder pass moved (LADDER_MOVED: QUENCH ★1's perBurn) at its fixed
    // value below
    // HULL-ON (the flip, GUARD, OPEN_RUNES): and a row RETUNE-1's plate runes moved (GUARD_MOVED) or OPEN-1's LONG ROAD
    // rewrite moved (OPEN_MOVED) at its switch-on value below
    // SHAPES-1 flip: and a row the reshape moved (SHAPES_MOVED: ASSEMBLY LINE's price) at its SHAPES value below
    const bad = rows.filter((r) => !num2At.has(r.id) && !(r.id in NUM3_MOVED) && !(r.id in TUNEX_MOVED) && !(r.id in YFURN_MOVED) && !(r.id in BAL2_MOVED) && !(r.id in Y7B2_MOVED) && !(r.id in ITEM5_MOVED) && !(r.id in LADDER_MOVED) && !(r.id in GUARD_MOVED) && !(r.id in OPEN_MOVED) && !(r.id in SHAPES_MOVED) && live(susaNew(r.id)) !== r.now).map((r) => `${r.id}: live ${String(live(susaNew(r.id)))}, want ${r.now} (base ${r.base}, ${r.rule})`);
    expect(bad).toEqual([]);
    // HULL-ON (the flip, GUARD): the 3 moved rows, fixture rows of runes.ts recorded at the map's `was` under the map's rule,
    // live at their guarded value; with the switch off, at their recorded one (the base amount objects back on the defs)
    const guard = rows.filter((r) => r.id in GUARD_MOVED);
    expect(guard.map((r) => r.id).sort()).toEqual(Object.keys(GUARD_MOVED).sort());
    for (const r of guard) {
      const m = GUARD_MOVED[r.id];
      expect([r.file, r.rule, r.now], r.id).toEqual(["src/sim/runes.ts", m.rule, m.was]);
      expect(live(r.id), r.id).toBe(m.now);
      expect(withGuard(() => live(r.id), false), `${r.id}, off`).toBe(m.was);
    }
    // HULL-ON (the flip, OPEN_RUNES): the moved row, a fixture row of runes.ts recorded at the map's `was` under the map's
    // rule, live at its open value; with the switch off, RUNE_LIST holds the base def again at its recorded one (read from
    // RUNE_LIST itself: TABLES keeps the defs it found at load)
    const open = rows.filter((r) => r.id in OPEN_MOVED);
    expect(open.map((r) => r.id).sort()).toEqual(Object.keys(OPEN_MOVED).sort());
    for (const r of open) {
      const m = OPEN_MOVED[r.id];
      expect([r.file, r.rule, r.now], r.id).toEqual(["src/sim/runes.ts", m.rule, m.was]);
      expect(live(r.id), r.id).toBe(m.now);
      expect(withOpenRunes(() => RUNE_LIST.find((d) => `RUNE_LIST.${d.id}.amount.n` === r.id)!.amount.n, false), `${r.id}, off`).toBe(m.was);
    }
    // SHAPES-1 flip: the moved row, a fixture row of content.ts recorded at the map's `was` under the map's rule, live at its
    // SHAPES value; with the switch off, at its recorded one (0.9.9's)
    const shaped = rows.filter((r) => r.id in SHAPES_MOVED);
    expect(shaped.map((r) => r.id).sort()).toEqual(Object.keys(SHAPES_MOVED).sort());
    for (const r of shaped) {
      const m = SHAPES_MOVED[r.id];
      expect([r.file, r.rule, r.now], r.id).toEqual(["src/sim/content.ts", m.rule, m.was]);
      expect(live(r.id), r.id).toBe(m.now);
      expect(withShapes(() => live(r.id), false), `${r.id}, off`).toBe(m.was);
    }
    // AZ-BUMP (the flip, LADDER_FIX): the moved row, a fixture row of content.ts recorded at the map's `was` under the map's
    // rule, live at its fixed value; with the switch off, at its recorded one (bb-0.9.7's)
    const ladder = rows.filter((r) => r.id in LADDER_MOVED);
    expect(ladder.map((r) => r.id).sort()).toEqual(Object.keys(LADDER_MOVED).sort());
    for (const r of ladder) {
      const m = LADDER_MOVED[r.id];
      expect([r.file, r.rule, r.now], r.id).toEqual(["src/sim/content.ts", m.rule, m.was]);
      expect(live(r.id), r.id).toBe(m.now);
      expect(withLadderFix(() => live(r.id), false), `${r.id}, off`).toBe(m.was);
    }
    // AZ-BUMP (TXT-AZ item 5): the 6 removed rows, every one a "same" fixture row recorded at the map's `was`, each gone
    // with its field (was each live at its recorded value)
    const item5 = rows.filter((r) => r.id in ITEM5_MOVED);
    expect(item5.map((r) => r.id).sort()).toEqual(Object.keys(ITEM5_MOVED).sort());
    for (const r of item5) {
      expect([r.rule, r.now], r.id).toEqual(["same", ITEM5_MOVED[r.id].was]);
      expect(live(r.id), r.id).toBeUndefined();
    }
    // Y7b2 (the flip): the 98 moved rows, every one a fixture row recorded at the map's `was`, each live at its release-Y
    // value (39) or gone with its field (59)
    const y7b2 = rows.filter((r) => r.id in Y7B2_MOVED);
    expect(y7b2.map((r) => r.id).sort()).toEqual(Object.keys(Y7B2_MOVED).sort());
    expect([y7b2.length, y7b2.filter((r) => Y7B2_MOVED[r.id].now === undefined).length]).toEqual([98, 59]);
    for (const r of y7b2) {
      expect(r.now, r.id).toBe(Y7B2_MOVED[r.id].was);
      expect(live(r.id), r.id).toBe(Y7B2_MOVED[r.id].now);
    }
    // BAL-2: the 3 moved content.ts rows, every one a fixture row recorded at the map's `was` under the map's rule, each
    // live at its 0.9.1 value (was each live at its recorded value)
    // HULL-ON (FREE_JOINS_HULL, R9 / R10 (a)): WEAVER's hull is live at FREE_JOINS_HULL's 1500 with free joins on (the
    // shipped world) and at BAL-2's 1700 with them off (was live at 1700)
    const bal2 = rows.filter((r) => r.id in BAL2_MOVED);
    expect(bal2.map((r) => r.id).sort()).toEqual(Object.keys(BAL2_MOVED).sort());
    for (const r of bal2) {
      const m = BAL2_MOVED[r.id];
      expect([r.file, r.rule, r.now], r.id).toEqual(["src/sim/content.ts", m.rule, m.was]);
      expect(live(r.id), r.id).toBe(r.id in FJ_HULL_MOVED ? FJ_HULL_MOVED[r.id] : m.now);
      expect(withFreeJoins(() => live(r.id), false), `${r.id}, free joins off`).toBe(m.now);
    }
    const yfurn = rows.filter((r) => r.id in YFURN_MOVED);
    expect(yfurn.map((r) => r.id).sort()).toEqual(Object.keys(YFURN_MOVED).sort());
    for (const r of yfurn) {
      const m = YFURN_MOVED[r.id];
      expect([r.file, r.rule, r.now], r.id).toEqual(["src/sim/runes.ts", m.rule, m.was]);
      expect(live(r.id), r.id).toBe(m.now);
    }
    // FLIP-X2 (TUNE-X, REVIEW-TUNEX): the 5 moved rune amounts, every one a fixture row of runes.ts recorded at the map's
    // `was` under the map's rule, each live at its FLIP-X2 value (was each live at its recorded value)
    const tunex = rows.filter((r) => r.id in TUNEX_MOVED);
    expect(tunex.map((r) => r.id).sort()).toEqual(Object.keys(TUNEX_MOVED).sort());
    for (const r of tunex) {
      const m = TUNEX_MOVED[r.id];
      expect([r.file, r.rule, r.now], r.id).toEqual(["src/sim/runes.ts", m.rule, m.was]);
      expect(live(r.id), r.id).toBe(m.now);
    }
    // NUM-3 (R1's STUN fold, N1 2.2): the moved rows, measured: 26 (20 "time", 3 "gone", 3 "reshaped"), every one a fixture
    // row of content.ts, "same" (no damage-family value moved) and recorded at the map's `was`; each live at its NUM-3 value
    // ("gone": no field; "reshaped": no field at the old name, its new fields live)
    const moved = rows.filter((r) => r.id in NUM3_MOVED);
    expect(moved.map((r) => r.id).sort()).toEqual(Object.keys(NUM3_MOVED).sort());
    expect(["time", "gone", "reshaped"].map((k) => moved.filter((r) => NUM3_MOVED[r.id].kind === k).length)).toEqual([20, 3, 3]);
    for (const r of moved) {
      const m = NUM3_MOVED[r.id];
      expect([r.file, r.rule, r.base, r.now], r.id).toEqual(["src/sim/content.ts", "same", m.was, m.was]);
      if (m.kind === "time") expect(live(r.id), r.id).toBe(y3(r.id, m.now)); // Y7b2: Y7B2_NUM3's where the flip moved it
      else expect(live(r.id), r.id).toBeUndefined();
      if (m.kind === "reshaped") for (const [k, v] of Object.entries(m.now)) expect(live(sibling(r.id, k)), sibling(r.id, k)).toBe(y3(sibling(r.id, k), v));
    }
    // SUS-A: the renamed rows (RIVETER ★1-★3), measured: 3, each live at its new path only
    const renamed = rows.filter((r) => susaNew(r.id) !== r.id);
    expect(renamed.map((r) => [r.id, live(r.id), live(susaNew(r.id))])).toEqual([
      ["ITEMS.riveter.gate.repair", undefined, 6], ["ITEMS.riveter.levels.2.gate.repair", undefined, 13],
      ["ITEMS.riveter.levels.3.gate.repair", undefined, 21],
    ]);
  });

  it("every numeric field of the scaled tables is in the fixture (a new piece needs the script re-run)", () => {
    const race = new Set(Object.keys(RACE_ITEMS)), w3 = new Set(WAVE3_IDS);
    const ids: string[] = [];
    for (const [id, d] of Object.entries(ITEMS)) if (!race.has(id) && !w3.has(id)) numericLeaves(`ITEMS.${id}`, d, ids);
    for (const [id, d] of Object.entries(WAVE3_ITEMS)) numericLeaves(`WAVE3_ITEMS.${id}`, d, ids);
    for (const [id, d] of Object.entries(P1_WAVE3_ITEMS)) numericLeaves(`P1_WAVE3_ITEMS.${id}`, d, ids);
    for (const [id, d] of Object.entries(RACE_ITEMS)) numericLeaves(`RACE_ITEMS.${id}`, d, ids);
    for (const [k, d] of Object.entries(AMMO)) if (!(k in RACE_AMMO)) numericLeaves(`AMMO.${k}`, d, ids);
    for (const [k, d] of Object.entries(RACE_AMMO)) numericLeaves(`RACE_AMMO.${k}`, d, ids);
    for (const [k, d] of Object.entries(HEROES)) if (!(k in RACE_HEROES)) numericLeaves(`HEROES.${k}`, { ...d, slots: undefined }, ids);
    for (const [k, d] of Object.entries(RACE_HEROES)) numericLeaves(`RACE_HEROES.${k}`, d, ids);
    numericLeaves("PENDULUM", PENDULUM, ids);
    numericLeaves("ECHO_CAP", ECHO_CAP, ids);
    for (const d of RUNE_LIST) ids.push(`RUNE_LIST.${d.id}.amount.n`);
    for (const d of SUSTAIN_RUNES) ids.push(`SUSTAIN_RUNES.${d.id}.amount.n`); // FLIP-X1 (F-d): the 8, N1-native
    // a field that names another scaled value follows it (the script skips it): the pendulum slug's base is the curve's floor
    const derived: Record<string, string> = { "RACE_AMMO.pendulum.base": "PENDULUM.floor" };
    // a numeric field missing from the fixture is fine only when its rule is "same" (a helper-built or computed value the
    // script can't read as a literal, never scaled); a damage-family or unknown field must be recorded
    // NUM-2 (REQ-BFG-047): `rules` lets the same field paths read NUM2_RULES (below); NUM-1's rules are the default, as before
    const ruleOf = (id: string, rules: typeof fixture.rules = fixture.rules): string | undefined => {
      const [table, ...p] = id.split(".");
      const star = (q: string[]) => q.map((s) => (/^\d+$/.test(s) ? "*" : s)).join(".");
      if (/ITEMS$/.test(table)) {
        let rest = p.slice(1);
        if (rest[0] === "levels") rest = rest.slice(2);
        return rules.spec[star(rest)];
      }
      if (/AMMO$/.test(table)) return rules.ammo[star(p.slice(1))];
      if (/HEROES$/.test(table)) return rules.heroes[star(p.slice(1))];
      return undefined;
    };
    // NUM-2 (REQ-BFG-047): the fields NUM-2 writes (scripts/num2-speed.mjs RULES' `to`, and a hero turret slot's speed) are
    // classified explicitly as NUM-2's: neither damage family nor waved through as NUM-1's "same". Such a field missing
    // from this fixture is fine only when it is a num2-base-intervals.json row's new path (NUM-2's checkers check it).
    // Before NUM-2 the renamed fields did not exist, and STEAM BREECH's steamPlated / steamBare passed here as "same".
    const N2 = "num2";
    const NUM2_RULES = {
      spec: { "turret.speed": N2, "factory.speed": N2, "factory.rate": N2, "mod.fireRate": N2, "core.fireRate": N2,
        "core.start": N2, "core.top": N2, "core.steamPlated": N2, "core.steamBare": N2 },
      ammo: {}, heroes: { "turrets.*.speed": N2 },
    };
    const missing = ids.filter((id) => !byId.has(susaOld(id)) && !(id in derived) // SUS-A: a renamed field counts as its row
      && !num3New.has(id) // NUM-3: a field NUM-3 added (num3New, classified above) counts as NUM-3's, checked below
      && !n1Native.has(id) // FLIP-X1 (F-d): a sustain rune's amount is N1-native (n1Native), checked below
      && !sustainNative.has(id) // FLIP-X2: a sustain piece's field is N1-native (SUSTAIN_N1), checked below
      && !(id in Y7B2_ADDED) // Y7b2: a field the flip added (Y7B2_ADDED), checked below
      && !(id in LADDER_ADDED) // AZ-BUMP (the flip, LADDER_FIX): a field the star-ladder pass added (LADDER_ADDED), checked below
      && !(id in SHAPES_ADDED) // SHAPES-1 flip: a shaped plain rig's N1-native damage field (SHAPES_ADDED), checked below
      && (ruleOf(id, NUM2_RULES) === N2 ? !num2To.has(id) : ruleOf(id) !== "same"));
    expect(missing).toEqual([]);
    // FLIP-X1 (F-d), the sustain-on pins: two-sided, the scan meets the 8 and none is a fixture row (under either name)
    expect(ids.filter((id) => n1Native.has(id)).sort()).toEqual([...n1Native.keys()].sort());
    expect([n1Native.size, [...n1Native.keys()].filter((id) => byId.has(id) || byId.has(id.replace(/^SUSTAIN_RUNES\./, "RUNE_LIST."))).length]).toEqual([8, 0]);
    // FLIP-X2 (REQ-BFG-069), the sustain pieces' pins: two-sided, the scan meets the 18 (the 18 the walk missed with the
    // switch on: WARD BELL's SHIELD cadence and count, MEND PRESS's speed and HEAL, MENDING LOOM's REGEN, at ★1-★3), none
    // is a NUM-1 or a NUM-2 row, and each is live at its value
    expect(ids.filter((id) => sustainNative.has(id)).sort()).toEqual([...sustainNative.keys()].sort());
    expect([sustainNative.size, [...sustainNative.keys()].filter((id) => byId.has(id) || num2To.has(id)).length]).toEqual([18, 0]);
    // HULL-ON (the flip, GUARD): WARD BELL's 3 SHIELD cadences live at the guarded def's (GUARD_SUSTAIN: 8 / 5 / 4 -> 4 / 2.5
    // / 2 s; run 5, ruling 22e26ded338944ea Q6: 4 / 3 / 2 s), each at SUSTAIN_N1's with the switch off
    for (const [id, v] of sustainNative) expect(live(id), id).toBe(id in GUARD_SUSTAIN ? GUARD_SUSTAIN[id] : v);
    expect(withGuard(() => Object.keys(GUARD_SUSTAIN).map((id) => live(id)), false)).toEqual(Object.keys(GUARD_SUSTAIN).map((id) => SUSTAIN_N1[id]));
    // Y7b2 (the flip): two-sided: the scan meets the 4 fields Y7B2_ADDED names, none is a fixture row, each live at its value
    expect(ids.filter((id) => id in Y7B2_ADDED).sort()).toEqual(Object.keys(Y7B2_ADDED).sort());
    for (const [id, v] of Object.entries(Y7B2_ADDED)) expect([byId.has(id), live(id)], id).toEqual([false, v]);
    // AZ-BUMP (the flip, LADDER_FIX): two-sided: the scan meets the 2 fields LADDER_ADDED names, none is a fixture row, each
    // live at its value; with the switch off neither exists (bb-0.9.7's defs)
    expect(ids.filter((id) => id in LADDER_ADDED).sort()).toEqual(Object.keys(LADDER_ADDED).sort());
    for (const [id, v] of Object.entries(LADDER_ADDED)) expect([byId.has(id), live(id)], id).toEqual([false, v]);
    expect(withLadderFix(() => Object.keys(LADDER_ADDED).map((id) => live(id)), false)).toEqual([undefined, undefined]);
    // SHAPES-1 flip: two-sided: the scan meets the 6 fields SHAPES_ADDED names, none is a fixture row, each live at its value
    // and whole (the N1 scale); with the switch off none exists (0.9.9's ITEMS has no shaped rig)
    expect(ids.filter((id) => id in SHAPES_ADDED).sort()).toEqual(Object.keys(SHAPES_ADDED).sort());
    for (const [id, v] of Object.entries(SHAPES_ADDED)) expect([byId.has(id), live(id), Number.isInteger(v)], id).toEqual([false, v, true]);
    expect(withShapes(() => Object.keys(SHAPES_ADDED).map((id) => live(id)), false)).toEqual(Object.keys(SHAPES_ADDED).map(() => undefined));
    // NUM-3 (R1's STUN fold, N1 2.2): two-sided: the scan meets every field of num3New and none is a fixture row; measured
    // 8 (BELLOWS' burn and per at ★1-★3, SABOT's round.seconds at ★1 and ★3), each live at its value. Unclassified, SABOT's
    // two would pass the line above as "same" (factory.round.seconds is FROSTBITE's and DRAG CHAIN's rule).
    // Y7b2 (the flip): SABOT ★3's own round left (Y7B2_NUM3), so the scan meets 7 of the 8
    expect(ids.filter((id) => num3New.has(id)).sort()).toEqual([...num3New.keys()].filter((id) => !(id in Y7B2_NUM3 && Y7B2_NUM3[id] === undefined)).sort());
    expect([num3New.size, [...num3New.keys()].filter((id) => byId.has(id)).length]).toEqual([8, 0]);
    for (const [id, v] of num3New) expect(live(id), id).toBe(y3(id, v)); // Y7b2: Y7B2_NUM3's where the flip moved it
    // NUM-2 (REQ-BFG-047): two-sided: every NUM-2 field the scan meets is a NUM-2 row under its new name and every NUM-2
    // row is a live numeric field the scan meets; measured 141 (114 speeds, 27 rate %s), 140 of them not in this fixture
    // (128 renamed, STEAM BREECH's 12) and 1 in it (GATLING's core.start, handed off above). And every field NUM-2
    // converted was a NUM-1 "same" one at its old path: NUM-2 converted no damage-family value.
    // FLIP-X2: MEND PRESS's 3 speeds are NUM-2-native too (SUSTAIN_N1, born whole after NUM-2's script), so not NUM-2's rows
    const met = ids.filter((id) => ruleOf(id, NUM2_RULES) === N2 && !sustainNative.has(id));
    // Y7b2 (the flip): ROTARY ★2/★3's fireRate and STEAM BREECH's 3 steamBare left with their fields (Y7B2_NUM2's gone rows),
    // so the scan meets 136, 135 not in this fixture (was [141, 140])
    expect([...met].sort()).toEqual([...num2To.keys()].filter((p) => !(p in Y7B2_NUM2 && Y7B2_NUM2[p].now === undefined)).sort());
    expect([met.length, met.filter((id) => !byId.has(id)).length]).toEqual([136, 135]);
    for (const q of num2) expect(ruleOf(q.path), q.path).toBe("same");
    for (const [id, of] of Object.entries(derived)) expect(live(id), id).toBe(live(of));
  });

  it("the damage family is whole at x10 and its sizes are N1's (hulls 1500-2250, plating cap 240, FRAY 2 a stack)", () => {
    // Y7b2 (the flip): a row gone with its field (Y7B2_MOVED's now undefined) has no live value to check
    for (const r of rows) if (r.rule === "x10" && !(r.id in Y7B2_MOVED && Y7B2_MOVED[r.id].now === undefined)) expect(Number.isInteger(live(susaNew(r.id))), r.id).toBe(true); // SUS-A: at its new path
    expect(FRAY_BONUS).toBe(2);
    expect(PLATE_CAP).toBe(240);
    expect(PLATE_PER_SLUG).toBe(20);
    // BAL-2 (REVIEW-BAL1 rows 1 and 8): WEAVER 1800 -> 1700, FURNACE 2000 -> 2100 (was [1800, 2000, 2100, 2150, 2200, 2250])
    // HULL-ON (bb-0.10.0, FREE_JOINS_HULL; cap's ruling 84ad10254e1855c8 = R9, R10 (a)): WEAVER 1700 -> 1500 with free joins
    // on (was [1700, 2100, 2100, 2150, 2200, 2250]); with them off, content.ts's 1700 again
    const hulls = () => Object.values(HEROES).map((h) => h.hull).sort((a, b) => a - b);
    expect(hulls()).toEqual([1500, 2100, 2100, 2150, 2200, 2250]);
    expect(withFreeJoins(hulls, false)).toEqual([1700, 2100, 2100, 2150, 2200, 2250]);
    // the rune amounts: x10 exactly where the unit is dmg, hull or plate (runes.ts header), the rest as they were
    for (const d of RUNE_LIST) {
      const r = byId.get(`RUNE_LIST.${d.id}.amount.n`)!;
      expect(r.rule, d.id).toBe(["dmg", "hull", "plate"].includes(d.amount.unit) ? "x10" : "same");
    }
    // FLIP-X1 (F-d): the 8 sustain runes are N1-native: SUS-D measured them in N1 units (a hull amount is already x10's
    // size), so no x10 applies. Each is whole and live as built (unit, n)
    // FLIP-X2 (TUNE-X line 4, REVIEW-TUNEX): LEECH VOW is rare at 15 (was "hull 20", epic)
    // Y-FURN (FURN-Y rows 3-4): SEARING searBurn 6 BURN stacks, "count 6", and SHATTER SHOT shatterPct 15, "pct 15" (were
    // both rule runes, "count 1")
    // BAL-2 (REVIEW-BAL1 row 5; 3a, cap's ruling f894080daebfa8c0): SEARING "count 6" -> "count 5", SHATTER SHOT "pct 15"
    // -> "pct 14"
    expect(Object.fromEntries(SUSTAIN_RUNES.map((d) => [d.id, `${d.amount.unit} ${live(`SUSTAIN_RUNES.${d.id}.amount.n`)}`]))).toEqual({
      bulwark_ward: "count 2", tick_guard: "sec 6", twin_salve: "hull 20", scrap_medic: "hull 300", leech_vow: "hull 15",
      green_thread: "hull 10", searing: "count 5", shatter_shot: "pct 14",
    });
    for (const d of SUSTAIN_RUNES) expect(Number.isInteger(d.amount.n), d.id).toBe(true);
  });
});
