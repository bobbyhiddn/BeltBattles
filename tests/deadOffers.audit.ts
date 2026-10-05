// 0.8.0 H1 M4 (REQ-BFG-021, acceptance 3; ref/BRIEF-v080-H1.md section 5.3): the shared body of the dead-offer audit
// tests (deadOffers.fb.test.ts: FOUNDRY and BASTION first; deadOffers.six.test.ts: the other four). Not a test file.
// For each hero's reference deck on days 1-10 (heroRefBuild), every buyable module is bought in at each sensible place
// (deadOffers.helpers.ts) until one changes a battle metric. The pairs where none does must be exactly the pinned list
// (deadOffers.inert.ts), each with its reason. BB_DEAD_AUDIT_DIR=<dir> writes every row (JSON lines, dead-<hero>.jsonl).
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buyableModules, type HeroId } from "../src/sim/content";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { audit, structural, type AuditRow } from "./deadOffers.helpers";
import { INERT, REASONS, reasonOf } from "./deadOffers.inert";

export function auditHeroes(heroes: HeroId[]): void {
  describe("REQ-BFG-021: every buyable module changes a battle metric on every hero's reference deck, days 1-10, or is a listed inert pair", () => {
    for (const hero of heroes) {
      it(`${hero}: the inert pairs are exactly the listed ones, each with a reason`, () => {
        const rows: AuditRow[] = [];
        for (let day = 1; day <= 10; day++) {
          const before = heroRefBuild(hero, day);
          expect(structural(before, 10), `${hero} day ${day}`).toEqual([]);
          for (const d of buyableModules()) rows.push(audit(hero, day, before, d));
        }
        const dir = process.env.BB_DEAD_AUDIT_DIR;
        if (dir) writeFileSync(join(dir, `dead-${hero}.jsonl`), rows.map((r) => JSON.stringify({ ...r, base: undefined, bought: undefined })).join("\n") + "\n");
        const found: Record<string, number[]> = {};
        for (const r of rows) if (!r.changed.length) (found[r.id] ??= []).push(r.day);
        expect(found).toEqual(INERT[hero]);
        for (const [id, days] of Object.entries(found)) for (const day of days) {
          const why = reasonOf(hero, id, day);
          expect(why, `${hero} ${id} day ${day}: no reason recorded`).toBeDefined();
          expect(REASONS[why!].length).toBeGreaterThan(40);
        }
        // every placement legal (a bought part on a full purse may go over the day's gold: the audit doesn't buy it)
        expect(rows.length).toBe(10 * buyableModules().length);
      }, 180_000); // NUM-3: an inert pair tries every sensible placement before it gives up, and SIFTER is inert on every hero's
      // days 1-10 now (num3Open), so a hero's audit takes 2-3.5 times as long: under the full suite's 8 workers 19-53 s on num3
      // (susa: 8-15 s), past vitest's 30 s default (weaver 52.7 s, siphon 44.5 s, furnace 30.3 s in NUM-3's first gate)
    }
  });
}
