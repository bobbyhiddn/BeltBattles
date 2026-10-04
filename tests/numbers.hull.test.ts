// NUM-1 (REQ-BFG-047, N1 2.5 "numbers.hull"): the integer damage pipeline. Hull and plating are whole numbers after every
// tick of 50 seeded battles per hero, runes included: each battle pits the hero's reference deck of a day (heroRefBuild)
// holding 3 battle runes against another hero's, holding 3 others, so over the 300 battles every rune in RUNE_LIST is held
// by both sides several times. Every damage-family amount a battle event carries (impact, fire, burn, poison, the wind,
// repair, plating) is whole too: the sim makes them so where they are created (src/sim/pct.ts).
import { describe, expect, it } from "vitest";
import { Battle, type SimEvent } from "../src/sim/battle";
import { cloneBuild, type Build } from "../src/sim/deck";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { RUNE_LIST, RUN_KINDS } from "../src/sim/runes";
import type { HeroId } from "../src/sim/content";

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
const BATTLE_RUNES = RUNE_LIST.filter((d) => !RUN_KINDS.includes(d.kind)); // the run's runes (hull, belt, gold) act at the dawn
const MAX_TICKS = 60 * 200;

const withRunes = (b: Build, ids: string[]): Build => ({ ...cloneBuild(b), runes: ids.map((id) => ({ id })) });
const runesFor = (i: number): string[] => [0, 1, 2].map((j) => BATTLE_RUNES[(i * 3 + j) % BATTLE_RUNES.length].id);

/** The damage-family amounts an event carries. */
function amounts(e: SimEvent): number[] {
  const x = e as unknown as Record<string, unknown>;
  const out: number[] = [];
  for (const k of ["dmg", "amount", "plate"]) if (typeof x[k] === "number") out.push(x[k] as number);
  return out;
}

describe("numbers.hull: hull and plating stay whole (the integer damage pipeline)", () => {
  for (const [h, hero] of HEROES.entries()) {
    it(`${hero}: 50 seeded battles, every tick`, () => {
      const bad: string[] = [];
      let ticks = 0, events = 0, held = 0;
      for (let i = 0; i < 50; i++) {
        const day = 1 + (i % 10), foe = HEROES[(h + 1 + (i % 5)) % HEROES.length];
        const mine = runesFor(h * 50 + i), theirs = runesFor(h * 50 + i + 7);
        held += mine.length + theirs.length;
        const bt = new Battle(withRunes(heroRefBuild(hero, day), mine), withRunes(heroRefBuild(foe, day), theirs), 7000 + h * 50 + i);
        for (let t = 0; t < MAX_TICKS && !bt.over; t++) {
          bt.step();
          ticks++;
          for (const s of bt.sides) {
            if (!Number.isInteger(s.hull.hp) || !Number.isInteger(s.hull.max) || !Number.isInteger(s.plate.plate))
              bad.push(`battle ${i} (${hero} vs ${foe}, day ${day}) tick ${bt.ticks} side ${s.side}: hp ${s.hull.hp}, max ${s.hull.max}, plate ${s.plate.plate}`);
          }
          for (const e of bt.drainEvents()) {
            events++;
            for (const v of amounts(e)) if (!Number.isInteger(v)) bad.push(`battle ${i} tick ${bt.ticks}: ${e.type} carries ${v}`);
          }
          if (bad.length > 5) break;
        }
        expect(bt.over, `battle ${i} ends`).toBe(true);
        if (bad.length > 5) break;
      }
      expect(bad).toEqual([]);
      expect(ticks).toBeGreaterThan(50 * 60 * 5); // the battles ran (at least 5 s each on average)
      expect(events).toBeGreaterThan(1000);
      expect(held).toBe(300);
    });
  }

  it("every battle rune is held in these battles", () => {
    const seen = new Set<string>();
    for (let h = 0; h < HEROES.length; h++) for (let i = 0; i < 50; i++) for (const id of [...runesFor(h * 50 + i), ...runesFor(h * 50 + i + 7)]) seen.add(id);
    expect([...seen].sort()).toEqual(BATTLE_RUNES.map((d) => d.id).sort());
  });
});
