// NUM-2 (REQ-BFG-047, N1 2.2): the BELTS tracks as whole steps of SPEED (K = 30). TURRET SPEED adds roundHalfUp(20% x the
// starting turret's level-1 speed) a level (content.ts TURRET_SPEED, levelSpeed; deck.ts turretSlots); the hero's signature
// FACTORY adds roundHalfUp(25% x its level-1 speed) a level (its ItemDef.levels 2-4, written by scripts/num2-speed.mjs).
// They replace BELTS' TURRET_SPEED [1, 1, 0.85, 0.72, 0.61] and the factory levels (x11/14, then x11/13 twice). N1's
// examples are pinned; the prices stay 10 / 20 / 30 gold.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HEROES, ITEMS, TURRET_SPEED, UPGRADE_PRICE, levelSpeed, secPer, type HeroId } from "../src/sim/content";
import { installedTurrets, turretSlots, type Build } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { Battle } from "../src/sim/battle";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { barge, SEED } from "./arsenal.bench";
import { K } from "./belts.helpers";
import { turretAt } from "../src/sim/battle"; // NUM-4: the BELTS lines against the battle
import { outputsAt } from "../src/sim/stars";
import { ICON } from "../src/render/font";
import { newRun } from "../src/game/run";
import { turretPanel } from "../src/screens/build/inspector";
import { factoryNext } from "../src/ui/upgradeText";

const HEROES6: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
const roundHalfUp = (x: number): number => Math.floor(x + 0.5 + 1e-9);
/** BELTS' old TURRET_SPEED (the interval x this at level n) and the base's signature factory intervals (the fixture). */
const OLD_TURRET = [1, 1, 0.85, 0.72, 0.61];
const FIX = JSON.parse(readFileSync(new URL("./fixtures/num2-base-intervals.json", import.meta.url), "utf8")) as { rows: { path: string; base: number; value: number; track?: boolean }[] };

/** N1 2.2's examples: L1 / L2 / L3 / L4. */
const TURRETS: Record<string, number[]> = {
  scrapcannon: [30, 36, 42, 48], dartgun: [55, 66, 77, 88], carronade: [38, 46, 54, 62], rampart: [40, 48, 56, 64], swivel: [43, 52, 61, 70],
  spikegun: [50, 60, 70, 80],
};
const FACTORIES: Record<string, number[]> = {
  kiln: [24, 30, 36, 42], loom: [42, 53, 64, 75], crucible: [19, 24, 29, 34], wardworks: [27, 34, 41, 48], sump: [27, 34, 41, 48],
  clockworks: [23, 29, 35, 41],
};

describe("NUM-2: the BELTS tracks as whole steps (N1 2.2)", () => {
  it("the prices stay 10 / 20 / 30 gold; TURRET SPEED is +20% of level 1 a level", () => {
    expect(UPGRADE_PRICE.slice(2)).toEqual([10, 20, 30]);
    expect(TURRET_SPEED).toBe(20);
  });

  it("TURRET SPEED on the 6 starting turrets: N1's examples, in the slots and in the battle (a level adds roundHalfUp(20% x L1))", () => {
    for (const hero of HEROES6) {
      const start = HEROES[hero].turrets.length ? installedTurrets(heroStartBuild(hero, 1)).filter((s) => s.turret.free) : [];
      expect(start.length, hero).toBeGreaterThan(0);
      for (const s of start) {
        const want = TURRETS[s.turret.def];
        expect(want, `${hero} ${s.turret.def}`).toBeDefined();
        const step = roundHalfUp((want[0] * 20) / 100);
        expect(want, s.turret.def).toEqual([0, 1, 2, 3].map((i) => want[0] + i * step));
        for (const level of [1, 2, 3, 4]) {
          const b = heroStartBuild(hero, 1);
          if (level > 1) b.upgrades = { ...(b.upgrades ?? {}), turret: level };
          const slot = turretSlots(b).find((x) => x.slot === s.slot)!;
          expect([slot.td!.speed, levelSpeed(want[0], level, TURRET_SPEED)], `${hero} ${s.turret.def} L${level}`).toEqual([want[level - 1], want[level - 1]]);
          // the battle's speed is the slot's (the starting decks hold no rate gear; FURNACE's long belt adds its 39%)
          const tu = new Battle(b, barge(), SEED).sides[0].turrets.find((t) => t.index === s.slot)!;
          const long = tu.speedRaw / slot.td!.speed;
          expect([1, 1.39].some((m) => Math.abs(long - m) < 1e-12), `${hero} L${level}: x${long}`).toBe(true);
          expect(tu.speed).toBe(roundHalfUp(tu.speedRaw));
          // within 5% of BELTS' rate at that level (N1: worst 4.3%, CARRONADE L2)
          const old = 30 / (secPer(want[0]) * OLD_TURRET[level]);
          expect(Math.abs(want[level - 1] / old - 1), `${s.turret.def} L${level}`).toBeLessThanOrEqual(0.05);
        }
      }
    }
  });

  it("a bought turret keeps its own speed at every TURRET SPEED level", () => {
    // FURNACE's free SCRAP CANNON in slot 0, a bought CARRONADE in the extra slot 1
    const b: Build = { ...heroStartBuild("furnace", 1), turrets: [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "carronade", uid: 91 }] };
    const at = (level: number, slot: number): number => turretSlots(level > 1 ? { ...b, upgrades: { turret: level } } : b).find((s) => s.slot === slot)!.td!.speed;
    for (const level of [1, 2, 3, 4]) expect([at(level, 0), at(level, 1)], `L${level}`).toEqual([TURRETS.scrapcannon[level - 1], 38]);
  });

  it("FACTORY on the 6 signature factories: N1's examples, in the data and in the battle (a level adds roundHalfUp(25% x L1))", () => {
    for (const hero of HEROES6) {
      const def = HEROES[hero].factory, want = FACTORIES[def];
      expect(want, `${hero} ${def}`).toBeDefined();
      const step = roundHalfUp((want[0] * 25) / 100);
      expect(want, def).toEqual([0, 1, 2, 3].map((i) => want[0] + i * step));
      for (const level of [1, 2, 3, 4]) {
        expect(effectAt(def, level).factory!.speed, `${def} L${level}`).toBe(want[level - 1]);
        const b: Build = { hero, items: [{ uid: 7, def, x: 4, y: 6 }], routes: [{ factory: 7, cells: [K(4, 5)] }], mods: [], beltCap: 40, hullBonus: 0, ...(level > 1 ? { upgrades: { factory: level } } : {}) };
        const f = new Battle(b, barge(), SEED).sides[0].factories.find((x) => x.uid === 7)!;
        expect(f.def.factory!.speed, `${def} L${level} in the battle`).toBe(want[level - 1]);
        // within 5% of BELTS' house curve at that level (N1: worst 2.5%)
        const row = FIX.rows.find((r) => r.path.endsWith(`.${def}.${level > 1 ? `levels.${level}.` : ""}factory.interval`))!;
        expect(Math.abs(want[level - 1] / (30 / row.base) - 1), `${def} L${level} vs ${row.base} s`).toBeLessThanOrEqual(0.05);
      }
      expect(ITEMS[def].factory!.speed).toBe(want[0]);
    }
  });
});

/** NUM-4: the {RATE} number a BELTS line names (the RATE glyph, then its digits). */
const rateIn = (text: string): number => Number(new RegExp(`${ICON.RATE}(\\d+)`).exec(text)?.[1] ?? NaN);

describe("NUM-4 (REQ-BFG-047; N1 2.5 belts.numbers): each BELTS line names the battle's SPEED after buying that level", () => {
  it("a starting turret's panel: SPEED: LEVEL l/4. UPGRADE: {RATE}n, n the turret's speed in a battle at level l + 1", () => {
    let n = 0;
    for (const hero of HEROES6) {
      const run = newRun(hero, 5150);
      const i = turretSlots(run.build).findIndex((s) => s.turret?.free);
      if (i < 0) continue;
      const slot = turretSlots(run.build)[i].slot;
      for (const level of [1, 2, 3, 4]) {
        run.build = { ...run.build, upgrades: level > 1 ? { turret: level } : undefined };
        const line = turretPanel(run, i)!.body.find((b) => b.text.startsWith("SPEED: "))?.text;
        expect(line, `${hero} L${level}`).toBeDefined();
        if (level === 4) { expect(line, hero).toBe("SPEED: LEVEL 4/4."); continue; }
        const next = { ...run.build, upgrades: { turret: level + 1 } };
        const speed = turretAt(new Battle(next, barge(), SEED).sides[0], slot)!.speed;
        expect([line!.startsWith(`SPEED: LEVEL ${level}/4. UPGRADE: `), rateIn(line!)], `${hero} L${level}: ${line}`).toEqual([true, speed]);
        n++;
      }
    }
    expect(n).toBe(18); // the 6 heroes' starting turrets x levels 1-3
  });

  it("a signature factory's panel line: UPGRADE: n BELTS, {RATE}m, m the factory's speed in a battle at level l + 1", () => {
    for (const hero of HEROES6) {
      const def = HEROES[hero].factory;
      for (const level of [1, 2, 3]) {
        const line = factoryNext(def, level)!;
        const b: Build = { hero, items: [{ uid: 7, def, x: 4, y: 6 }], routes: [{ factory: 7, cells: [K(4, 5)] }], mods: [], beltCap: 40, hullBonus: 0, upgrades: { factory: level + 1 } };
        const f = new Battle(b, barge(), SEED).sides[0].factories.find((x) => x.uid === 7)!;
        expect([line.startsWith(`UPGRADE: ${outputsAt(def, level + 1)} BELTS, `), rateIn(line)], `${def} L${level}: ${line}`).toEqual([true, f.def.factory!.speed]);
      }
      expect(factoryNext(def, 4)).toBeNull();
    }
  });
});
