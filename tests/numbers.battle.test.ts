// NUM-4 (REQ-BFG-047; N1 2.5 "numbers.battle"): the battle's numbers through the formatters. In seeded battles of every
// hero's reference deck, every pop a player reads (impact, burn, poison, the wind and every heal: arenaReact.ts prints
// each through fmtDmg) is a whole amount printed as it is; the hull readout too; the clocks read whole elapsed seconds
// (fmtClock, floored like any clock); the results card prints the side's real totals as they are; a belt's estimate
// prints the walk's own whole damage; the BELTS lines name the battle's next SPEED.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { HEROES, TURRET_SPEED, UPGRADE_MAX, levelSpeed, withSustain, type HeroId } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { FRACTIONAL, captureFormats, fmtClock, fmtDmg } from "../src/ui/statFormat";
import { resultRows } from "../src/screens/battleHud";
import { factoryNext, turretSpeedRow } from "../src/ui/upgradeText";
import { icons } from "../src/render/font";
import { newRun } from "../src/game/run";
import { beltPanel } from "../src/screens/build/inspector";

const HERO_IDS: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];

describe("numbers.battle (NUM-4): pops, hull, clocks, results, the estimate and the BELTS lines", () => {
  it("every pop's amount and the hull are whole and print as they are (5 battles a hero, days 2-10)", () => {
    FRACTIONAL.length = 0;
    let pops = 0;
    const kinds = new Set<string>();
    const bad: string[] = [];
    withSustain(() => {
      for (const [h, hero] of HERO_IDS.entries()) {
        for (let i = 0; i < 5; i++) {
          const day = 2 + 2 * i, foe = HERO_IDS[(h + 1 + i) % HERO_IDS.length];
          const bt = new Battle(heroRefBuild(hero, day), heroRefBuild(foe, day), 9100 + h * 10 + i);
          for (let t = 0; t < 60 * 200 && !bt.over; t++) {
            bt.step();
            for (const e of bt.drainEvents()) {
              const amount = e.type === "heal" ? e.amount : e.type === "impact" || e.type === "burn" || e.type === "poison" || e.type === "wind" ? e.dmg : undefined;
              if (amount === undefined) continue;
              const { value } = captureFormats(() => fmtDmg(amount), e.type);
              if (!Number.isInteger(amount) || value !== String(amount)) bad.push(`${hero} v ${foe} d${day}: ${e.type} ${amount} -> ${value}`);
              kinds.add(e.type);
              pops++;
            }
            for (const s of bt.sides) if (fmtDmg(Math.max(0, s.hull.hp)) !== String(Math.max(0, s.hull.hp))) bad.push(`hull ${s.hull.hp}`);
          }
          // the results card: the side's real totals, printed as they are
          const rows = resultRows({ player: bt.sides[0].stats, enemy: bt.sides[1].stats });
          const dealt = rows.find((r) => r[0] === "DAMAGE DEALT")!;
          expect(dealt[1]).toBe(String(bt.sides[0].stats.damage));
          expect(Number.isInteger(bt.sides[0].stats.damage) && Number.isInteger(bt.sides[0].stats.burnDealt)).toBe(true);
          for (const r of rows) for (const v of r.slice(1)) expect(v, `${r[0]}: ${v}`).not.toMatch(/\d\.\d/);
        }
      }
    });
    expect(bad).toEqual([]);
    expect(FRACTIONAL).toEqual([]);
    expect(pops).toBeGreaterThan(1000);
    expect([...kinds].sort()).toEqual(expect.arrayContaining(["burn", "impact"]));
  });

  it("the estimate: every belt panel's DMG and TIME cells print the walk's whole numbers (every hero's ref deck, days 1-10)", () => {
    FRACTIONAL.length = 0;
    let cells = 0;
    for (const hero of HERO_IDS) for (let day = 1; day <= 10; day++) {
      const run = newRun(hero, 4242);
      run.build = heroRefBuild(hero, day);
      run.build.routes.forEach((_, i) => {
        const bp = beltPanel(run, i);
        if (!bp) return;
        for (const row of bp.foot) for (const [label, v] of row.cells ?? []) {
          if (label === "DMG") expect(v, `${hero} d${day} belt ${i}`).toMatch(/^\d+(-\d+)?$/);
          if (label === "TIME") expect(v, `${hero} d${day} belt ${i}`).toMatch(/^\d+ SEC$/);
          cells++;
        }
      });
    }
    expect(FRACTIONAL.map((r) => `${r.unit} ${r.value}`)).toEqual([]);
    expect(cells).toBeGreaterThan(200);
  });

  it("the clocks: whole elapsed seconds, floored like any clock", () => {
    expect(fmtClock(12.34)).toBe("12");
    // WIND-2 (REQ-BFG-093): the clock is a count of sim ticks (1/60 s), snapped to the nearest tick, then floored: 12.999 s
    // is 0.06 of a tick before tick 780 (13.000 s), so it reads 13; tick 779, the last of second 12, reads 12
    expect(fmtClock(12.999)).toBe("13");
    expect(fmtClock(779 / 60)).toBe("12");
    expect(fmtClock(0)).toBe("0");
    expect(fmtClock(59.5)).toBe("59");
    expect(fmtClock(24.99999999999986)).toBe("25"); // the float clock's drift on tick 1500 (NUM-3 finding 6) reads 25
    expect(fmtClock(60)).toBe("60");
    // FIRST SHOT on the results card is a clock reading too
    const s = { damage: 1200, shots: 30, firstShot: 2.25, idle: 3, turretTime: 30, jams: 1, burnDealt: 170, disrupted: 0 } as never;
    expect(resultRows({ player: s, enemy: s })[2]).toEqual(["FIRST SHOT", "2S", "2S"]);
    expect(resultRows({ player: s, enemy: s })[3]).toEqual(["GUNS IDLE", "10%", "10%"]);
  });

  it("the BELTS lines: the next level's SPEED is the battle's (the hero factories' levels, a starting turret's track)", () => {
    for (const hero of Object.keys(HEROES) as HeroId[]) {
      const def = HEROES[hero].factory;
      for (let l = 1; l < UPGRADE_MAX; l++) {
        const next = effectAt(def, l + 1).factory;
        if (!next) continue;
        expect(factoryNext(def, l), `${def} L${l}`).toMatch(/^UPGRADE: \d+ BELTS, /);
        expect(factoryNext(def, l)!.endsWith(icons(`{RATE}${next.speed}.`)), `${def} L${l}`).toBe(true);
      }
      expect(factoryNext(def, UPGRADE_MAX)).toBeNull();
    }
    // SCRAP CANNON 30 / 36 / 42 / 48 (content.ts levelSpeed, N1 2.2)
    for (let l = 1; l < UPGRADE_MAX; l++) expect(turretSpeedRow(levelSpeed(30, l + 1, TURRET_SPEED), l)).toBe(icons(`LEVEL ${l}/${UPGRADE_MAX}. UPGRADE: {RATE}${30 + 6 * l}.`));
    expect(turretSpeedRow(48, UPGRADE_MAX)).toBe(`LEVEL ${UPGRADE_MAX}/${UPGRADE_MAX}.`);
  });
});
