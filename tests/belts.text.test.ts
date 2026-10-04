// bb-0.8.3 (REQ-BFG-044, REQ-BFG-043, REQ-BFG-032; job BELTS M4, D11): the text the new slots and the hero's two gold
// upgrades change, every number tied to the sim.
//  - The signature factories read their numbers at their FACTORY level (they never merge): the cycle, the slots ("ONTO UP
//    TO N BELTS IN TURN": stars.ts outputsAt), the slug's base, the KILN's ride scaling, the LOOM's fray, the pendulum's
//    curve. They have no next star, no merge progress and no caravan card (D9 is void): their panel says the level, the
//    next level in one line and the UPGRADE button with its price.
//  - A starting turret's panel says its TURRET SPEED level and next level in one line, and leads with its UPGRADE button.
//  - Every bought factory's next-star and MERGES WITH lines close with its belt slots at that star ("..., 3 BELTS.").
//  - T47 (REQ-BFG-047, whole numbers only): none of these lines shows a decimal. The cycles, the turret's speed-up, the
//    ride scaling, the fray and the pendulum's peak are said in words (FASTER, MORE); the belts, damage, gold and level
//    stay numbers, each still the sim's. tests/t47.decimals.test.ts checks every T47 text.
import { describe, expect, it } from "vitest";
import { AMMO, FRAY_BONUS, FRAY_MAX, ITEMS, TURRET_SPEED, UPGRADE_PRICE, type HeroId } from "../src/sim/content";
import { PENDULUM } from "../src/sim/races/data";
import { effectAt, outputsAt, SIGNATURE_FACTORIES } from "../src/sim/stars";
import { Battle } from "../src/sim/battle";
import { abilityText, cardText, gist, mergesWithText, nextStarText } from "../src/ui/abilityText";
import { factoryNext, levelLine, turretNext, turretSpeedRow, upgradeLabel } from "../src/ui/upgradeText";
import { flavour } from "../src/screens/build/flavour";
import { itemPanel, turretPanel } from "../src/screens/build/inspector";
import { buyUpgrade, newRun } from "../src/game/run";
import { fullNotice } from "../src/screens/build/edit";
import { barge, SEED } from "./arsenal.bench";

const numbers = (s: string): number[] => (s.match(/\d+(\.\d+)?/g) ?? []).map(Number);
const OWNER: Record<string, HeroId> = { kiln: "furnace", loom: "weaver", crucible: "foundry", wardworks: "bastion", clockworks: "metronome", sump: "siphon" };
const base = (def: string, s: number): number => effectAt(def, s).factory!.base ?? AMMO[effectAt(def, s).factory!.ammo].base;
const LEVELS = [1, 2, 3, 4];

describe("M4: the signature factories' text at every FACTORY level, each number the sim's", () => {
  it("the KILN, LOOM, CLOCKWORKS and SUMP: slots and slug at levels 1-4, no decimal (T47); the KILN's ride scaling, the LOOM's fray and the pendulum in words", () => {
    for (const s of LEVELS) {
      const k = abilityText("kiln", s).sentences;
      expect(k).toEqual([
        `STAMPS CINDER SLUGS ONTO UP TO ${outputsAt("kiln", s)} BELTS IN TURN.`,
        `A CINDER SLUG DEALS ${base("kiln", s)} DAMAGE, AND MORE THE LONGER IT RIDES.`,
      ]);
      expect(numbers(k.join(" "))).toEqual([outputsAt("kiln", s), base("kiln", s)]);
      const l = abilityText("loom", s).sentences;
      expect(numbers(l.join(" "))).toEqual([outputsAt("loom", s), base("loom", s), FRAY_MAX]);
      const c = abilityText("clockworks", s).sentences;
      expect(numbers(c.join(" "))).toEqual([outputsAt("clockworks", s), PENDULUM.floor, PENDULUM.floor + PENDULUM.swing]);
      const p = abilityText("sump", s).sentences;
      expect(numbers(p.join(" "))).toEqual([outputsAt("sump", s), base("sump", s)]);
      for (const t of [k, l, c, p]) expect(t.join(" "), `L${s}`).not.toMatch(/\d\.\d/);
    }
    // the words stand for real effects: a cinder slug gains damage as it rides, and every fray adds damage
    expect(AMMO.cinder.rideScale).toBeGreaterThan(0);
    expect(FRAY_BONUS).toBeGreaterThan(0);
    expect(abilityText("kiln", 2).sentences[0]).toBe("STAMPS CINDER SLUGS ONTO UP TO 3 BELTS IN TURN.");
    expect(abilityText("loom", 4).sentences[0]).toBe("WEAVES THREAD SLUGS ONTO UP TO 6 BELTS IN TURN.");
  });

  it("the numbers are the battle's: the hero factory's slug base and cycle at each FACTORY level", () => {
    for (const def of ["kiln", "loom", "wardworks", "crucible"]) for (const s of LEVELS) {
      const hero = OWNER[def];
      const b = { hero, items: [{ uid: 7, def, x: 4, y: 6 }], routes: [], mods: [], beltCap: 40, hullBonus: 0, ...(s > 1 ? { upgrades: { factory: s } } : {}) };
      const f = new Battle(b, barge(), SEED).sides[0].factories.find((x) => x.uid === 7)!;
      expect([f.def.factory!.interval, f.def.factory!.base ?? AMMO[f.def.factory!.ammo].base], `${def} L${s}`).toEqual([effectAt(def, s).factory!.interval, base(def, s)]);
    }
  });

  it("no next star, no merge progress, no caravan card for a signature factory; its panel says the level and the next one", () => {
    for (const def of SIGNATURE_FACTORIES) {
      for (const s of [1, 2, 3]) expect(nextStarText(def, s), `${def} ${s}`).toBeNull();
      expect(cardText(def), def).not.toMatch(/OWN|COPY|COPIES|MERGE/);
      // the next level in one line (T47: no decimal): the belts at the next level, the sim's, and FASTER, which the
      // next level's shorter cycle makes true
      for (const l of [1, 2, 3]) {
        const next = factoryNext(def, l)!;
        expect(next, `${def} L${l}`).toBe(`NEXT: ${outputsAt(def, l + 1)} BELTS, FASTER`);
        expect(numbers(next)).toEqual([outputsAt(def, l + 1)]);
        expect(effectAt(def, l + 1).factory!.interval, `${def} L${l}`).toBeLessThan(effectAt(def, l).factory!.interval);
      }
      expect(factoryNext(def, 4)).toBeNull();
    }
    expect(factoryNext("kiln", 1)).toBe("NEXT: 3 BELTS, FASTER");
    expect([1, 2, 3, 4].map(upgradeLabel)).toEqual(["UPGRADE 10G", "UPGRADE 20G", "UPGRADE 30G", null]);
    expect([1, 2, 3].map((l) => numbers(upgradeLabel(l)!)[0])).toEqual([UPGRADE_PRICE[2], UPGRADE_PRICE[3], UPGRADE_PRICE[4]]);
    // FURNACE's KILN panel at levels 1-4: the level line, the next line (none at 4), the button (none at 4), no copy text
    const run = newRun("furnace", 5, "text");
    run.gold = 100;
    const kiln = run.build.items.find((p) => p.def === "kiln")!;
    for (const l of LEVELS) {
      const p = itemPanel(run, kiln.uid)!, text = p.body.map((b) => b.text);
      expect(text, `L${l}`).toContain(levelLine("factory", l));
      if (l < 4) expect(text, `L${l}`).toContain(factoryNext("kiln", l));
      expect(p.labels, `L${l}`).toEqual(l < 4 ? [upgradeLabel(l)] : []);
      expect(p.title).toBe("KILN");
      expect(text.join(" "), `L${l}`).not.toMatch(/COPY|COPIES|TO MERGE|NEXT STAR|MERGES WITH|OWN/);
      expect(p.sub).toBe(`FACTORY · BELTS 1/${outputsAt("kiln", l)}`);
      if (l < 4) buyUpgrade(run, "factory");
    }
    expect(levelLine("factory", 2)).toBe("FACTORY LEVEL 2/4");
  });

  it("a starting turret's panel: TURRET SPEED level and next level in one line, its numbers the battle's; the UPGRADE button first", () => {
    const run = newRun("furnace", 5, "speed");
    run.gold = 100;
    for (const l of LEVELS) {
      const t = turretPanel(run, 0)!;
      const fires = new Battle(run.build, barge(), SEED).sides[0].turrets[0].interval;
      const line = `SPEED ${turretSpeedRow(fires, l)}.`;
      expect(t.body.map((b) => b.text), `L${l}`).toContain(line);
      if (l < 4) {
        expect(turretNext(fires, l)).toBe("NEXT: FIRES FASTER"); // T47: no seconds
        expect(line).toBe(`SPEED LEVEL ${l}/4, NEXT: FASTER.`);
        expect(t.labels[0], `L${l}`).toBe(upgradeLabel(l));
        buyUpgrade(run, "turret");
        // FASTER is the battle's: the next level's interval is this one scaled by TURRET_SPEED, and shorter
        const after = new Battle(run.build, barge(), SEED).sides[0].turrets[0].interval;
        expect(+after.toFixed(2)).toBe(+((fires * TURRET_SPEED[l + 1]) / TURRET_SPEED[l]).toFixed(2));
        expect(after).toBeLessThan(fires);
      } else {
        expect(line).toBe("SPEED LEVEL 4/4.");
        expect(t.labels[0]).not.toMatch(/UPGRADE/);
      }
    }
    // a bought turret has no speed line and no UPGRADE button
    const b = newRun("weaver", 5, "bought");
    expect(turretPanel(b, 0)!.labels[0]).toBe("UPGRADE 10G"); // WEAVER's starting DART GUN
  });

  it("the full-slots notice points at the upgrade for a hero factory, at the next star for a bought one", () => {
    expect(fullNotice("KILN", 2, 1, true)).toBe("KILN'S 2 BELTS ARE IN USE · UPGRADE FOR A 3RD");
    expect(fullNotice("LOOM", 5, 3, true)).toBe("LOOM'S 5 BELTS ARE IN USE · UPGRADE FOR A 6TH");
    expect(fullNotice("LOOM", 6, 4, true)).toBe("LOOM'S 6 BELTS ARE IN USE · DRAG A BELT TO REROUTE");
    expect(fullNotice("STAMP PRESS", 2, 1, false)).toBe("STAMP PRESS'S 2 BELTS ARE IN USE · ★2 OPENS A 3RD");
    expect(fullNotice("STAMP PRESS", 4, 3, false)).toBe("STAMP PRESS'S 4 BELTS ARE IN USE · DRAG A BELT TO REROUTE");
  });

  it("a bought factory's next star and MERGES WITH lines close with its belts at that star", () => {
    for (const def of ["press", "gantry", "twinmould"]) for (const s of [1, 2]) {
      expect(nextStarText(def, s), `${def} ★${s}`).toBe(`NEXT STAR: ${gist(def, s + 1)}, ${outputsAt(def, s + 1)} BELTS.`);
      expect(mergesWithText(def, s + 1)).toBe(`MERGES WITH YOUR ${ITEMS[def].name} INTO ★${s + 1}: ${gist(def, s + 1)}, ${outputsAt(def, s + 1)} BELTS.`);
    }
  });

  it("every signature factory's flavour is a tip with no number (F1); the descriptions the new rules made false are reworded", () => {
    // U2c group 0 fix 5: the KILN's face says HEAT, so its tip keeps only the breech's half (battle.ts FURNACE_LONG_BELT)
    expect(flavour("kiln")).toEqual(["A LONG BELT SPEEDS UP THE GUN IT FEEDS."]);
    expect(flavour("loom")).toEqual(["IT FEEDS ONE BELT MORE THAN MOST FACTORIES."]);
    expect(Math.max(...Object.values(ITEMS).filter((d) => d.kind === "factory").map((d) => outputsAt(d.id, 1)))).toBe(outputsAt("loom", 1));
    expect([ITEMS.loom.desc, ITEMS.gantry.desc, ITEMS.mimic.desc, ITEMS.twinmould.desc].map((d) => d.join(" "))).toEqual([
      "WEAVES THREAD SLUGS THAT FRAY THE HULL ONTO MANY BELTS.",
      "A FAST PRESS THAT FEEDS ONE BELT MORE THAN MOST, IN TURN.",
      "STAMPS YOUR HERO'S SIGNATURE AMMO FROM A SECOND FACTORY.",
      "CASTS PLAIN SLUGS SEVERAL AT A TIME, ONE BELT EACH.",
    ]);
    for (const s of [1, 2, 3]) expect(outputsAt("gantry", s)).toBe(outputsAt("press", s) + 1);
    expect([1, 2, 3].map((s) => effectAt("twinmould", s).factory!.pour)).toEqual([2, 2, 3]);
  });
});
