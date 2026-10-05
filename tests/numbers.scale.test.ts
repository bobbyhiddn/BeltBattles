// NUM-1 (REQ-BFG-047, N1 section 2.1): the checker of the scripted x10 (scripts/num1-scale.mjs). The script recorded the
// base's values in tests/fixtures/num1-base-values.json before it scaled them. Here every damage-family value ("x10") must
// be 10x its recorded base (N1's two non-whole ones rounded half up), every other value ("same": counts, gold, tiles, %,
// ratios, time) its recorded base, and every numeric field of the scaled tables must be in the fixture, so a piece added
// on a new base without re-running the script fails here.
// NUM-2 (REQ-BFG-047): the "same" values NUM-2 converted (intervals -> speed, multipliers -> rate %) left their base on
// purpose: they are handed off, row for row, to NUM-2's record tests/fixtures/num2-base-intervals.json and its checkers.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AMMO, FRAY_BONUS, HEROES, ITEMS, WAVE3_IDS, WAVE3_ITEMS } from "../src/sim/content";
import { PENDULUM, RACE_AMMO, RACE_HEROES, RACE_ITEMS } from "../src/sim/races/data";
import { PLATE_CAP, PLATE_PER_SLUG } from "../src/sim/races/bastion";
import { ECHO_CAP } from "../src/sim/races/siphon";
import { RUNE_LIST } from "../src/sim/runes";
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

const TABLES: Record<string, unknown> = {
  FRAY_BONUS, ITEMS, WAVE3_ITEMS, AMMO, HEROES, RACE_ITEMS, RACE_AMMO, RACE_HEROES, PENDULUM, PLATE_PER_SLUG, PLATE_CAP, ECHO_CAP,
  RUNE_LIST: Object.fromEntries(RUNE_LIST.map((d) => [d.id, d])), SABOTAGE_HULL, HULL_FLOOR, EQ, ROUND_EQ, MEAN_PLATE,
  MEAN_PLATE_OTHER, P1_WAVE3_ITEMS,
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
    const bad = rows.filter((r) => !num2At.has(r.id) && live(susaNew(r.id)) !== r.now).map((r) => `${r.id}: live ${String(live(susaNew(r.id)))}, want ${r.now} (base ${r.base}, ${r.rule})`);
    expect(bad).toEqual([]);
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
      && (ruleOf(id, NUM2_RULES) === N2 ? !num2To.has(id) : ruleOf(id) !== "same"));
    expect(missing).toEqual([]);
    // NUM-2 (REQ-BFG-047): two-sided: every NUM-2 field the scan meets is a NUM-2 row under its new name and every NUM-2
    // row is a live numeric field the scan meets; measured 141 (114 speeds, 27 rate %s), 140 of them not in this fixture
    // (128 renamed, STEAM BREECH's 12) and 1 in it (GATLING's core.start, handed off above). And every field NUM-2
    // converted was a NUM-1 "same" one at its old path: NUM-2 converted no damage-family value.
    const met = ids.filter((id) => ruleOf(id, NUM2_RULES) === N2);
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
  });
});
