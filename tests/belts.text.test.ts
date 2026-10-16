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
import { levelSpeed, secPer } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): SPEED (K = 30), TURRET SPEED's whole steps
import { roundHalfUp } from "../src/sim/pct"; // NUM-2: a turret's speed rounds half up once (battle.ts makeTurret)
import { fmtSpeed } from "../src/ui/statFormat"; // NUM-2: the faces keep SEC, 30 / speed in two decimals
import { icons } from "../src/render/font"; // NUM-4 (REQ-BFG-047): the UPGRADE lines' RATE icon
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
      // NUM-2 (REQ-BFG-047): the cycle is the whole speed (was .interval on both sides, undefined === undefined after the rename)
      expect([f.def.factory!.speed, f.def.factory!.base ?? AMMO[f.def.factory!.ammo].base], `${def} L${s}`).toEqual([effectAt(def, s).factory!.speed, base(def, s)]);
      expect(f.def.factory!.speed, `${def} L${s}`).toBeGreaterThan(0); // NUM-2: a real number, never undefined
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
        // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): what its UPGRADE button does (was `NEXT: ${n} BELTS, FASTER`); T47: no seconds
        // NUM-4 (REQ-BFG-047; N1 2.2): the line names the next level's SPEED, the data's (effectAt at l + 1), after the RATE
        // icon, through fmtSpeed (was `UPGRADE: ${n} BELTS, WORKS FASTER.`); its numbers are the belts and that SPEED
        const speed = effectAt(def, l + 1).factory!.speed;
        expect(next, `${def} L${l}`).toBe(icons(`UPGRADE: ${outputsAt(def, l + 1)} BELTS, {RATE}${fmtSpeed(speed)}.`));
        expect(numbers(next)).toEqual([outputsAt(def, l + 1), speed]);
        expect(secPer(effectAt(def, l + 1).factory!.speed), `${def} L${l}`).toBeLessThan(secPer(effectAt(def, l).factory!.speed)); // NUM-2: 30 / speed (was .interval)
      }
      expect(factoryNext(def, 4)).toBeNull();
    }
    // NUM-4 (REQ-BFG-047): the KILN's level-2 SPEED after the RATE icon (was "UPGRADE: 3 BELTS, WORKS FASTER.")
    expect(factoryNext("kiln", 1)).toBe(icons(`UPGRADE: 3 BELTS, {RATE}${fmtSpeed(effectAt("kiln", 2).factory!.speed)}.`));
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
    expect(levelLine("factory", 2)).toBe("FACTORY: LEVEL 2/4."); // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): was "FACTORY LEVEL 2/4"
  });

  it("a starting turret's panel: TURRET SPEED level and next level in one line, its numbers the battle's; the UPGRADE button first", () => {
    const run = newRun("furnace", 5, "speed");
    run.gold = 100;
    // NUM-2 (REQ-BFG-047): the starting turret's level-1 speed (its TurretDef's) and its other rates (gear, long belt: none here)
    const t1 = new Battle(run.build, barge(), SEED).sides[0].turrets[0], s1 = t1.def.speed, rates = t1.speedRaw / s1;
    for (const l of LEVELS) {
      const t = turretPanel(run, 0)!;
      const fires = new Battle(run.build, barge(), SEED).sides[0].turrets[0].interval;
      // NUM-4 (REQ-BFG-047; N1 2.2): turretSpeedRow / turretNext take the next level's SPEED (was this level's interval,
      // `fires`): the data's, levelSpeed(s1, l + 1, TURRET_SPEED) x the turret's rates rounded half up once (the rule the
      // NUM-2 check below ties to the battle; SCRAP CANNON 30 / 36 / 42 / 48); at the top level no UPGRADE
      const nextSpeed = l < 4 ? Math.max(1, roundHalfUp(levelSpeed(s1, l + 1, TURRET_SPEED) * rates)) : t1.speed;
      const line = `SPEED: ${turretSpeedRow(nextSpeed, l)}`; // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): was `SPEED ${turretSpeedRow(fires, l)}.`
      expect(t.body.map((b) => b.text), `L${l}`).toContain(line);
      if (l < 4) {
        // NUM-4 (REQ-BFG-047): the UPGRADE names the next level's SPEED after the RATE icon (was "UPGRADE: FIRES FASTER."
        // and "SPEED: LEVEL l/4. UPGRADE: FASTER."); T47: no decimal
        expect(turretNext(nextSpeed, l)).toBe(icons(`UPGRADE: {RATE}${fmtSpeed(nextSpeed)}.`));
        expect(line).toBe(`SPEED: LEVEL ${l}/4. ${icons(`UPGRADE: {RATE}${fmtSpeed(nextSpeed)}.`)}`);
        expect(line).not.toMatch(/\d\.\d/);
        expect(t.labels[0], `L${l}`).toBe(upgradeLabel(l));
        buyUpgrade(run, "turret");
        // NUM-4: the SPEED the line named is the battle's once that level is bought
        expect(new Battle(run.build, barge(), SEED).sides[0].turrets[0].speed, `L${l + 1}`).toBe(nextSpeed);
        // FASTER is the battle's: the next level's interval is this one scaled by TURRET_SPEED, and shorter
        // NUM-2 (REQ-BFG-047; was +after.toFixed(2) = +(fires x TURRET_SPEED[l + 1] / TURRET_SPEED[l]).toFixed(2), x0.85 a
        // level): an EQUIVALENT check of the new rule: the next level's speed is levelSpeed(s1, l + 1, TURRET_SPEED) (+
        // roundHalfUp(20% x s1) a level: SCRAP CANNON 30 / 36 / 42 / 48), x its rates rounded half up once, and the gun
        // fires every 30 / that: the panel's SEC (fmtSpeed, two decimals) and the battle's interval exactly
        const after = new Battle(run.build, barge(), SEED).sides[0].turrets[0].interval;
        const want = secPer(Math.max(1, roundHalfUp(levelSpeed(s1, l + 1, TURRET_SPEED) * rates)));
        // NUM-4: fmtSpeed prints a SPEED now (the line above checks the panel's {RATE}n against the battle's); the interval is
        // compared exactly as a number (was fmtSpeed(after) vs fmtSpeed(want), NUM-2's two-decimal SEC)
        expect(String(after), `L${l + 1}`).toBe(String(want));
        expect(after, `L${l + 1}`).toBeCloseTo(want, 9);
        expect(after).toBeLessThan(fires);
      } else {
        expect(line).toBe("SPEED: LEVEL 4/4.");
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
    // SHAPES-1 flip: GANTRY PRESS is 2x3, its size's +1 belt slot (foot.ts footSlots) makes 4/5/6, so at ★1 it feeds the
    // most, 4, one more than the LOOM's 3 (was the LOOM's 3, which GANTRY PRESS tied). The LOOM's tip, ONE BELT MORE THAN
    // MOST FACTORIES, still holds: most factories feed one belt fewer than it at ★1
    const outs1 = Object.values(ITEMS).filter((d) => d.kind === "factory").map((d) => outputsAt(d.id, 1));
    expect(Math.max(...outs1)).toBe(outputsAt("gantry", 1));
    expect([outputsAt("gantry", 1), outputsAt("loom", 1)]).toEqual([4, 3]);
    expect(outs1.filter((n) => n === outputsAt("loom", 1) - 1).length).toBeGreaterThan(outs1.length / 2);
    expect([ITEMS.loom.desc, ITEMS.gantry.desc, ITEMS.mimic.desc, ITEMS.twinmould.desc].map((d) => d.join(" "))).toEqual([
      "WEAVES THREAD SLUGS THAT FRAY THE HULL ONTO MANY BELTS.",
      "A FAST PRESS THAT FEEDS THE MOST BELTS, IN TURN.",
      "STAMPS YOUR HERO'S SIGNATURE AMMO FROM A SECOND FACTORY.",
      "CASTS PLAIN SLUGS SEVERAL AT A TIME, ONE BELT EACH.",
    ]);
    // SHAPES-1 flip: GANTRY PRESS keeps its lead on STAMP PRESS (+1) and its 2x3 size adds +1 more (footSlots): 4/5/6 (was
    // STAMP PRESS's + 1, 3/4/5). Its desc is drawn nowhere (KEPT_FLAVOUR's gantry row is []; its face says FEEDS 4 BELTS IN
    // TURN.). PLAIN-1F (M5; BRIEF-PLAIN1F M5): reworded true in 0.9.9's world anyway (was "... FEEDS ONE BELT MORE THAN MOST,
    // IN TURN.", two more with SHAPES on): it feeds the most belts of any factory at every star, LOOM's included
    for (const s of [1, 2, 3]) expect(outputsAt("gantry", s)).toBe(outputsAt("press", s) + 2);
    for (const s of [1, 2, 3]) {
      const outs = Object.values(ITEMS).filter((d) => d.kind === "factory" && d.id !== "gantry").map((d) => outputsAt(d.id, s));
      expect(outputsAt("gantry", s), `★${s}: the most belts`).toBeGreaterThan(Math.max(...outs));
    }
    expect([1, 2, 3].map((s) => effectAt("twinmould", s).factory!.pour)).toEqual([2, 2, 3]);
  });
});
