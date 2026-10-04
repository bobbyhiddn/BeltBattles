// NUM-1 (REQ-BFG-047, N1 section 2.1): the checker of the scripted x10 (scripts/num1-scale.mjs). The script recorded the
// base's values in tests/fixtures/num1-base-values.json before it scaled them. Here every damage-family value ("x10") must
// be 10x its recorded base (N1's two non-whole ones rounded half up), every other value ("same": counts, gold, tiles, %,
// ratios, time) its recorded base, and every numeric field of the scaled tables must be in the fixture, so a piece added
// on a new base without re-running the script fails here.
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
    const bad = rows.filter((r) => live(r.id) !== r.now).map((r) => `${r.id}: live ${String(live(r.id))}, want ${r.now} (base ${r.base}, ${r.rule})`);
    expect(bad).toEqual([]);
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
    const ruleOf = (id: string): string | undefined => {
      const [table, ...p] = id.split(".");
      const star = (q: string[]) => q.map((s) => (/^\d+$/.test(s) ? "*" : s)).join(".");
      if (/ITEMS$/.test(table)) {
        let rest = p.slice(1);
        if (rest[0] === "levels") rest = rest.slice(2);
        return fixture.rules.spec[star(rest)];
      }
      if (/AMMO$/.test(table)) return fixture.rules.ammo[star(p.slice(1))];
      if (/HEROES$/.test(table)) return fixture.rules.heroes[star(p.slice(1))];
      return undefined;
    };
    const missing = ids.filter((id) => !byId.has(id) && !(id in derived) && ruleOf(id) !== "same");
    expect(missing).toEqual([]);
    for (const [id, of] of Object.entries(derived)) expect(live(id), id).toBe(live(of));
  });

  it("the damage family is whole at x10 and its sizes are N1's (hulls 1800-2250, plating cap 240, FRAY 2 a stack)", () => {
    for (const r of rows) if (r.rule === "x10") expect(Number.isInteger(live(r.id)), r.id).toBe(true);
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
