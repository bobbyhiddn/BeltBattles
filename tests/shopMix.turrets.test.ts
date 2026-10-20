// 0.6.2s TURRET SLOTS (REQ-BFG-031 step 5, REQ-BFG-033): the caravan's family mix once merchants stock turrets. On
// every day 1-10, over 4,000 seeded caravans per day through the real shop code (newRun, set to the day with no
// rerolls, then rollShop: the sample of output-0.6.2s's family-share table), rigs (kind "gate") are offered at least
// 2x as often as turrets and at least 2x as often as cores; one caravan may show more of anything. Turrets are
// offered, and no legendary (THUNDERER among them) before day 4. The shop is hero-blind (REQ-BFG-021): it counts the
// turret copies a player bought, never a hull's free 1-star starting copy. (A file of its own: the joins branch adds
// tests/shopMix.test.ts.)
import { describe, expect, it } from "vitest";
import { ITEMS, RUN_DAYS, type HeroId } from "../src/sim/content";
import { turretList } from "../src/sim/deck";
import { gainModule } from "../src/game/fuse";
import { installFromCargo, newRun, rollShop, storeTurret, type Run } from "../src/game/run";

const N = 4000; // seeded caravans per day
const FAMILIES = ["rig", "factory", "core", "mod", "supply", "turret"] as const;
type Family = (typeof FAMILIES)[number];
const family = (def: string): Family => {
  const k = ITEMS[def].kind;
  return k === "gate" || k === "converter" ? "rig" : k; // GATES-1 (REQ-BFG-052): a GATE (kind "converter") is offered where rigs are; none exists with GATES off
};

/** Each seed's fresh run of `hero` (after `setup`), rolled on each day 1-10 with no rerolls. One run serves every
 *  day: rollShop reads the run and writes only run.shop.wagons, so each roll is a fresh run's roll on that day. */
function roll(hero: HeroId, seeds: number, visit: (day: number, run: Run) => void, setup?: (run: Run) => void): void {
  for (let seed = 1; seed <= seeds; seed++) {
    const run = newRun(hero, seed, "shopmix");
    setup?.(run);
    for (let day = 1; day <= RUN_DAYS; day++) {
      run.day = day;
      run.shop.rerolls = 0;
      rollShop(run);
      visit(day, run);
    }
  }
}

/** Every caravan of `seeds` seeds x days 1-10, as text (merchant, def, price per offer). */
function caravans(hero: HeroId, seeds: number, setup?: (run: Run) => void): string[] {
  const out: string[] = [];
  roll(hero, seeds, (day, run) => out.push(`${day} ${JSON.stringify(run.shop.wagons)}`), setup);
  return out;
}

describe("REQ-BFG-033: rigs lead the caravan once merchants stock turrets (0.6.2s step 5)", () => {
  it("days 1-10, 4,000 caravans a day: rigs at least 2x turrets and 2x cores; turrets offered; no legendary before day 4", () => {
    const days = Array.from({ length: RUN_DAYS }, () => Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<Family, number>);
    const early: string[] = [];
    let thunderer = 0;
    roll("furnace", N, (day, run) => {
      for (const w of run.shop.wagons) for (const o of w.offers) {
        days[day - 1][family(o.def)]++;
        if (ITEMS[o.def].rarity === "legendary" && day < 4) early.push(`day ${day}: ${o.def}`);
        if (o.def === "thunderer") thunderer++;
      }
    });
    days.forEach((n, i) => {
      const day = `day ${i + 1}: ${JSON.stringify(n)}`;
      expect(n.turret, day).toBeGreaterThan(0);
      expect(n.rig, `${day} rig >= 2x turret`).toBeGreaterThanOrEqual(2 * n.turret);
      expect(n.rig, `${day} rig >= 2x core`).toBeGreaterThanOrEqual(2 * n.core);
    });
    expect(early).toEqual([]);
    expect(thunderer).toBeGreaterThan(0); // the ARCANE DEALER sells it from day 4
  });

  it("hero-blind: FURNACE (one SCRAP CANNON) and WEAVER (three DART GUNs) get identical caravans (REQ-BFG-021)", () => {
    expect(caravans("weaver", 300)).toEqual(caravans("furnace", 300));
  });

  it("the shop counts a bought turret, in cargo or installed, and a merged starting copy, never a 1-star starting copy", () => {
    const fresh = caravans("furnace", 100);
    // the free 1-star starting copy moved to cargo still doesn't count
    expect(caravans("furnace", 100, (run) => expect(storeTurret(run, 0).ok).toBe(true))).toEqual(fresh);
    // a bought BOMBARD counts the same in cargo as installed in the extra slot, and it changes some caravans
    const cargo = caravans("furnace", 100, (run) => void gainModule(run, "bombard"));
    const installed = caravans("furnace", 100, (run) => {
      const g = gainModule(run, "bombard");
      expect(installFromCargo(run, g.uid, 1).ok).toBe(true);
    });
    expect(installed).toEqual(cargo);
    expect(cargo).not.toEqual(fresh);
    // a starting copy merged with a bought one (2 stars, still free) counts
    const merged = caravans("furnace", 100, (run) => {
      gainModule(run, "scrapcannon");
      expect(turretList(run.build)).toEqual([{ slot: 0, def: "scrapcannon", uid: 90, stars: 2, free: true }]);
    });
    expect(merged).not.toEqual(fresh);
  });
});
