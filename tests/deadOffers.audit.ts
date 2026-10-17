// 0.8.0 H1 M4 (REQ-BFG-021, acceptance 3; ref/BRIEF-v080-H1.md section 5.3): the shared body of the dead-offer audit
// tests (deadOffers.fb.test.ts: FOUNDRY and BASTION first; deadOffers.six.test.ts: the other four). Not a test file.
// For each hero's reference deck on days 1-10 (heroRefBuild), every buyable module is bought in at each sensible place
// (deadOffers.helpers.ts) until one changes a battle metric. The pairs where none does must be exactly the pinned list
// (deadOffers.inert.ts), each with its reason. BB_DEAD_AUDIT_DIR=<dir> writes every row (JSON lines, dead-<hero>.jsonl).
// BUMP-1D (the 10-wins release, rules bb-0.11.0): PLAIN_RIGS and SHAPES2 are on, so the catalogue holds twelve more buyable
// pieces (103 buyable modules, was 91: 1030 rows a hero, was 910). Each hero is audited in two worlds, each run explicitly
// (withLongRun, withPlainRigs and withShapes2 put the switches back): the bb-0.11.0 world, every switch on, against INERT
// (this test as it was, re-keyed); and the bb-0.10.0 world, LONG_RUN, PLAIN_RIGS and SHAPES2 off, against INERT less the twelve
// new pieces, which are not in that catalogue (the pins as they stood at bb-0.10.0: with the switches off the audit finds the
// same pairs, so the old path stays covered). The old world's rows go to dead-<hero>.bb0100.jsonl.
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buyableModules, type HeroId } from "../src/sim/content";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { withLongRun } from "../src/sim/longRun";
import { PLAIN_RIG_IDS, withPlainRigs } from "../src/sim/plainRigs";
import { SHAPES2_IDS, withShapes2 } from "../src/sim/shapes2";
import { audit, structural, type AuditRow } from "./deadOffers.helpers";
import { INERT, REASONS, reasonOf } from "./deadOffers.inert";

/** BUMP-1D: the twelve pieces PLAIN_RIGS (six) and SHAPES2 (six) add to the catalogue; the bb-0.10.0 world has none of them. */
const NEW_PIECES: readonly string[] = [...PLAIN_RIG_IDS, ...SHAPES2_IDS];

/** Run `fn` in a world: every switch the 10-wins release turned on (LONG_RUN, PLAIN_RIGS, SHAPES2), or all three off. SHAPES2 goes
 *  outside PLAIN_RIGS, so the two come back in the order they load in (PLAIN_RIGS' six, then SHAPES2's) and ITEMS keeps its order
 *  for the next hero's audit (validate.ts's shapes worlds nest withShapes2 outermost for the same reason). */
const inWorld = <T>(on: boolean, fn: () => T): T => withLongRun(() => withShapes2(() => withPlainRigs(fn, on), on), on);

/** The pairs the bb-0.10.0 world must show: the listed ones less the twelve new pieces. */
function oldInert(hero: HeroId): Record<string, number[]> {
  return Object.fromEntries(Object.entries(INERT[hero]).filter(([id]) => !NEW_PIECES.includes(id)));
}

/** One hero's audit in one world: the rows, the inert pairs against the pinned list (INERT, or less the twelve), each with a reason. */
function auditWorld(hero: HeroId, on: boolean): void {
  inWorld(on, () => {
    // the world is the one asked for: the twelve are in the catalogue with the switches on, none of them with the switches off
    expect(buyableModules().map((d) => d.id).filter((id) => NEW_PIECES.includes(id)).sort(), `${hero}: the twelve new pieces in the catalogue`)
      .toEqual(on ? [...NEW_PIECES].sort() : []);
    const rows: AuditRow[] = [];
    for (let day = 1; day <= 10; day++) {
      const before = heroRefBuild(hero, day);
      expect(structural(before, 10), `${hero} day ${day}`).toEqual([]);
      for (const d of buyableModules()) rows.push(audit(hero, day, before, d));
    }
    const dir = process.env.BB_DEAD_AUDIT_DIR;
    if (dir) writeFileSync(join(dir, `dead-${hero}${on ? "" : ".bb0100"}.jsonl`), rows.map((r) => JSON.stringify({ ...r, base: undefined, bought: undefined })).join("\n") + "\n");
    const found: Record<string, number[]> = {};
    for (const r of rows) if (!r.changed.length) (found[r.id] ??= []).push(r.day);
    expect(found).toEqual(on ? INERT[hero] : oldInert(hero));
    for (const [id, days] of Object.entries(found)) for (const day of days) {
      const why = reasonOf(hero, id, day);
      expect(why, `${hero} ${id} day ${day}: no reason recorded`).toBeDefined();
      expect(REASONS[why!].length).toBeGreaterThan(40);
    }
    // every placement legal (a bought part on a full purse may go over the day's gold: the audit doesn't buy it)
    expect(rows.length).toBe(10 * buyableModules().length);
  });
}

export function auditHeroes(heroes: HeroId[]): void {
  describe("REQ-BFG-021: every buyable module changes a battle metric on every hero's reference deck, days 1-10, or is a listed inert pair", () => {
    for (const hero of heroes) {
      it(`${hero}: the inert pairs are exactly the listed ones, each with a reason`, () => auditWorld(hero, true), 180_000);
      // NUM-3: an inert pair tries every sensible placement before it gives up, and SIFTER is inert on every hero's
      // days 1-10 now (num3Open), so a hero's audit takes 2-3.5 times as long: under the full suite's 8 workers 19-53 s on num3
      // (susa: 8-15 s), past vitest's 30 s default (weaver 52.7 s, siphon 44.5 s, furnace 30.3 s in NUM-3's first gate).
      // BUMP-1D: 103 modules (was 91), a hero's audit took 9-52 s in the runs on the tip (weaver the longest, siphon next; one
      // vitest worker beside the other helpers' runs), well inside 180 s
      it(`${hero}: with LONG_RUN, PLAIN_RIGS and SHAPES2 off (BUMP-1D: the bb-0.10.0 catalogue) the inert pairs are the listed ones less the twelve new pieces`, () => auditWorld(hero, false), 180_000);
    }
  });
}
