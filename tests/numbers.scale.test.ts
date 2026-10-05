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
      expect(live(toPath(q)), toPath(q)).toBe(q.value);
    }
    // NUM-2 (REQ-BFG-047): measured, 129 rows handed off: NUM-2's 114 speeds and 15 of its 27 rate %s (the other 12,
    // STEAM BREECH's steamPlated / steamBare, were never NUM-1 rows: 1 / 1.35 is not a literal; the scan below)
    expect([handed.length, handed.filter((r) => num2At.get(r.id)!.kind === "speed").length]).toEqual([129, 114]);
    // NUM-3: a row NUM-3 moved (NUM3_MOVED) is checked at its NUM-3 value below instead of its recorded one
    // FLIP-X2: and a row TUNE-X moved (TUNEX_MOVED, the 5 rune amounts) at its FLIP-X2 value below
    const bad = rows.filter((r) => !num2At.has(r.id) && !(r.id in NUM3_MOVED) && !(r.id in TUNEX_MOVED) && live(susaNew(r.id)) !== r.now).map((r) => `${r.id}: live ${String(live(susaNew(r.id)))}, want ${r.now} (base ${r.base}, ${r.rule})`);
    expect(bad).toEqual([]);
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
      if (m.kind === "time") expect(live(r.id), r.id).toBe(m.now);
      else expect(live(r.id), r.id).toBeUndefined();
      if (m.kind === "reshaped") for (const [k, v] of Object.entries(m.now)) expect(live(sibling(r.id, k)), sibling(r.id, k)).toBe(v);
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
    for (const [id, v] of sustainNative) expect(live(id), id).toBe(v);
    // NUM-3 (R1's STUN fold, N1 2.2): two-sided: the scan meets every field of num3New and none is a fixture row; measured
    // 8 (BELLOWS' burn and per at ★1-★3, SABOT's round.seconds at ★1 and ★3), each live at its value. Unclassified, SABOT's
    // two would pass the line above as "same" (factory.round.seconds is FROSTBITE's and DRAG CHAIN's rule).
    expect(ids.filter((id) => num3New.has(id)).sort()).toEqual([...num3New.keys()].sort());
    expect([num3New.size, [...num3New.keys()].filter((id) => byId.has(id)).length]).toEqual([8, 0]);
    for (const [id, v] of num3New) expect(live(id), id).toBe(v);
    // NUM-2 (REQ-BFG-047): two-sided: every NUM-2 field the scan meets is a NUM-2 row under its new name and every NUM-2
    // row is a live numeric field the scan meets; measured 141 (114 speeds, 27 rate %s), 140 of them not in this fixture
    // (128 renamed, STEAM BREECH's 12) and 1 in it (GATLING's core.start, handed off above). And every field NUM-2
    // converted was a NUM-1 "same" one at its old path: NUM-2 converted no damage-family value.
    // FLIP-X2: MEND PRESS's 3 speeds are NUM-2-native too (SUSTAIN_N1, born whole after NUM-2's script), so not NUM-2's rows
    const met = ids.filter((id) => ruleOf(id, NUM2_RULES) === N2 && !sustainNative.has(id));
    expect([...met].sort()).toEqual([...num2To.keys()].sort());
    expect([met.length, met.filter((id) => !byId.has(id)).length]).toEqual([141, 140]);
    for (const q of num2) expect(ruleOf(q.path), q.path).toBe("same");
    for (const [id, of] of Object.entries(derived)) expect(live(id), id).toBe(live(of));
  });

  it("the damage family is whole at x10 and its sizes are N1's (hulls 1800-2250, plating cap 240, FRAY 2 a stack)", () => {
    for (const r of rows) if (r.rule === "x10") expect(Number.isInteger(live(susaNew(r.id))), r.id).toBe(true); // SUS-A: at its new path
    expect(FRAY_BONUS).toBe(2);
    expect(PLATE_CAP).toBe(240);
    expect(PLATE_PER_SLUG).toBe(20);
    expect(Object.values(HEROES).map((h) => h.hull).sort((a, b) => a - b)).toEqual([1800, 2000, 2100, 2150, 2200, 2250]);
    // the rune amounts: x10 exactly where the unit is dmg, hull or plate (runes.ts header), the rest as they were
    for (const d of RUNE_LIST) {
      const r = byId.get(`RUNE_LIST.${d.id}.amount.n`)!;
      expect(r.rule, d.id).toBe(["dmg", "hull", "plate"].includes(d.amount.unit) ? "x10" : "same");
    }
    // FLIP-X1 (F-d): the 8 sustain runes are N1-native: SUS-D measured them in N1 units (a hull amount is already x10's
    // size), so no x10 applies. Each is whole and live as built (unit, n)
    // FLIP-X2 (TUNE-X line 4, REVIEW-TUNEX): LEECH VOW is rare at 15 (was "hull 20", epic)
    expect(Object.fromEntries(SUSTAIN_RUNES.map((d) => [d.id, `${d.amount.unit} ${live(`SUSTAIN_RUNES.${d.id}.amount.n`)}`]))).toEqual({
      bulwark_ward: "count 2", tick_guard: "sec 6", twin_salve: "hull 20", scrap_medic: "hull 300", leech_vow: "hull 15",
      green_thread: "hull 10", searing: "count 1", shatter_shot: "count 1",
    });
    for (const d of SUSTAIN_RUNES) expect(Number.isInteger(d.amount.n), d.id).toBe(true);
  });
});
