// bb-0.8.3 (REQ-BFG-042, REQ-BFG-032; job BELTS M4): the text the new slots and the signature copies change, every
// number tied to the sim.
//  - The signature factories read their numbers at every star (they level up by merging): the cycle, the slots
//    ("ONTO UP TO N BELTS IN TURN": stars.ts outputsAt), the slug's base (its level's), the KILN's ride scaling, the
//    LOOM's fray, the pendulum's curve; their next star and merge progress; their caravan card says whose they are.
//  - Every factory's next-star and MERGES WITH lines close with its belt slots at that star ("..., 3 BELTS.").
import { describe, expect, it } from "vitest";
import { AMMO, FRAY_BONUS, FRAY_MAX, HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { PENDULUM } from "../src/sim/races/data";
import { effectAt, outputsAt, SIGNATURE_FACTORIES, signatureOf } from "../src/sim/stars";
import { Battle } from "../src/sim/battle";
import { abilityText, cardText, gist, mergeProgressText, mergesWithText, nextStarText } from "../src/ui/abilityText";
import { flavour } from "../src/screens/build/flavour";
import { cargoPanel, itemPanel, offerPanel } from "../src/screens/build/inspector";
import { gainModule } from "../src/game/fuse";
import { newRun, rollShop, type Run } from "../src/game/run";
import { barge, SEED } from "./arsenal.bench";

const numbers = (s: string): number[] => (s.match(/\d+(\.\d+)?/g) ?? []).map(Number);
const OWNER: Record<string, HeroId> = { kiln: "furnace", loom: "weaver", crucible: "foundry", wardworks: "bastion", clockworks: "metronome", sump: "siphon" };
const base = (def: string, s: number): number => effectAt(def, s).factory!.base ?? AMMO[effectAt(def, s).factory!.ammo].base;

describe("M4: the signature factories' text at every star, each number the sim's", () => {
  it("the KILN, LOOM, CLOCKWORKS and SUMP: cycle, slots and slug at ★1-3; the KILN's ride scaling, the LOOM's fray, the pendulum", () => {
    for (const s of [1, 2, 3]) {
      const k = abilityText("kiln", s).sentences, iv = (d: string) => effectAt(d, s).factory!.interval;
      expect(k).toEqual([
        `STAMPS A CINDER SLUG EVERY ${iv("kiln")} SECONDS, ONTO UP TO ${outputsAt("kiln", s)} BELTS IN TURN.`,
        `A CINDER SLUG DEALS ${base("kiln", s)} DAMAGE, AND ${AMMO.cinder.rideScale} MORE DAMAGE FOR EACH SECOND IT RIDES.`,
      ]);
      expect(numbers(k.join(" "))).toEqual([iv("kiln"), outputsAt("kiln", s), base("kiln", s), AMMO.cinder.rideScale]);
      const l = abilityText("loom", s).sentences;
      expect(numbers(l.join(" "))).toEqual([iv("loom"), outputsAt("loom", s), base("loom", s), FRAY_BONUS, FRAY_MAX]);
      const c = abilityText("clockworks", s).sentences;
      expect(numbers(c.join(" "))).toEqual([iv("clockworks"), outputsAt("clockworks", s), PENDULUM.floor, PENDULUM.floor + PENDULUM.swing, PENDULUM.peak, 10]);
      const p = abilityText("sump", s).sentences;
      expect(numbers(p.join(" "))).toEqual([iv("sump"), outputsAt("sump", s), base("sump", s)]);
    }
    expect(abilityText("kiln", 2).sentences[0]).toBe("STAMPS A CINDER SLUG EVERY 0.98 SECONDS, ONTO UP TO 3 BELTS IN TURN.");
    expect(abilityText("loom", 3).sentences[0]).toBe("WEAVES A THREAD SLUG EVERY 0.48 SECONDS, ONTO UP TO 5 BELTS IN TURN.");
  });

  it("the numbers are the battle's: a ★2 KILN's slug base and cycle, and the slots validate and the editor read", () => {
    for (const def of ["kiln", "loom", "wardworks"]) for (const s of [1, 2, 3]) {
      const hero = OWNER[def];
      const b = { hero, items: [{ uid: 7, def, x: 4, y: 6, ...(s > 1 ? { stars: s } : {}) }], routes: [], mods: [], beltCap: 40, hullBonus: 0 };
      const f = new Battle(b, barge(), SEED).sides[0].factories.find((x) => x.uid === 7)!;
      expect([f.def.factory!.interval, f.def.factory!.base ?? AMMO[f.def.factory!.ammo].base], `${def} ★${s}`).toEqual([effectAt(def, s).factory!.interval, base(def, s)]);
    }
  });

  it("next star and merge progress: a signature factory's lines at ★1-2, and its MERGES WITH line", () => {
    for (const def of SIGNATURE_FACTORIES) {
      for (const s of [1, 2]) {
        expect(nextStarText(def, s), `${def} ★${s}`).toBe(`NEXT STAR: ${gist(def, s + 1)}, ${outputsAt(def, s + 1)} BELTS.`);
        for (const n of numbers(nextStarText(def, s)!)) {
          expect(numbers(abilityText(def, s + 1).sentences.join(" ")).includes(n) || n === outputsAt(def, s + 1), `${def} ★${s}: ${n}`).toBe(true);
        }
      }
      expect(nextStarText(def, 3)).toBeNull();
      expect(mergesWithText(def, 2)).toBe(`MERGES WITH YOUR ${ITEMS[def].name} INTO ★2: ${gist(def, 2)}, ${outputsAt(def, 2)} BELTS.`);
    }
    // the levels grow the cycle and the belts, never the damage (oracle 6c20deea1363d0bb)
    expect(nextStarText("kiln", 1)).toBe("NEXT STAR: 4 DAMAGE CINDER SLUGS EVERY 0.98 SECONDS, 3 BELTS.");
    // the panels: FURNACE's ★1 KILN shows its next star and 1 MORE COPY TO MERGE; at ★2, 2 MORE COPIES; a waiting copy too
    const run = newRun("furnace", 5, "text");
    const kiln = run.build.items.find((p) => p.def === "kiln")!;
    const lines = (r: Run, uid: number) => itemPanel(r, uid)!.body.map((b) => b.text);
    expect(lines(run, kiln.uid)).toEqual(expect.arrayContaining([nextStarText("kiln", 1), mergeProgressText(1)]));
    gainModule(run, "kiln");
    expect(lines(run, kiln.uid)).toEqual(expect.arrayContaining([nextStarText("kiln", 2), mergeProgressText(2)]));
    const wait = gainModule(run, "kiln");
    expect(cargoPanel(run, wait.uid)!.body.map((b) => b.text)).toEqual(expect.arrayContaining([nextStarText("kiln", 1)]));
  });

  it("the caravan card says whose it is: FURNACE'S OWN FACTORY on the card line, and FURNACE'S OWN in its panel's sub line", () => {
    for (const def of SIGNATURE_FACTORIES) expect(cardText(def), def).toBe(`${HEROES[OWNER[def]].name}'S OWN FACTORY.`);
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) {
      for (let seed = 1; seed < 200; seed++) {
        const run = newRun(hero, seed, "card");
        run.day = 5;
        rollShop(run);
        const at = run.shop.wagons.flatMap((w, wi) => w.offers.map((o, si) => ({ o, wi, si }))).find((x) => x.o.def === signatureOf(hero));
        if (!at) continue;
        const p = offerPanel(run, at.wi, at.si)!;
        expect(p.sub, hero).toBe(`EPIC FACTORY · ${HEROES[hero].name}'S OWN`);
        expect(p.title).toBe(ITEMS[signatureOf(hero)].name);
        expect(p.labels[0], hero).toBe(`BUY+MERGE ${at.o.price}G`); // the MERGE badge's label: it merges with the starting copy
        break;
      }
    }
  });

  it("every signature factory's flavour is a tip with no number (F1); the descriptions the new rules made false are reworded", () => {
    expect(flavour("kiln")).toEqual(["LONG BELTS HEAT ITS SLUGS, AND A LONG BELT SPEEDS UP THE GUN IT FEEDS."]);
    expect(flavour("loom")).toEqual(["IT FEEDS ONE BELT MORE THAN MOST FACTORIES."]);
    expect(Math.max(...Object.values(ITEMS).filter((d) => d.kind === "factory").map((d) => outputsAt(d.id, 1)))).toBe(outputsAt("loom", 1));
    expect([ITEMS.loom.desc, ITEMS.gantry.desc, ITEMS.mimic.desc, ITEMS.twinmould.desc].map((d) => d.join(" "))).toEqual([
      "WEAVES THREAD SLUGS THAT FRAY THE HULL ONTO MANY BELTS.",
      "A FAST PRESS THAT FEEDS ONE BELT MORE THAN MOST, IN TURN.",
      "STAMPS YOUR HERO'S SIGNATURE AMMO FROM A SECOND FACTORY.",
      "CASTS PLAIN SLUGS SEVERAL AT A TIME, ONE BELT EACH.",
    ]);
    // GANTRY PRESS's lead and TWIN MOULD's pour, as the words say
    for (const s of [1, 2, 3]) expect(outputsAt("gantry", s)).toBe(outputsAt("press", s) + 1);
    expect([1, 2, 3].map((s) => effectAt("twinmould", s).factory!.pour)).toEqual([2, 2, 3]);
  });
});
