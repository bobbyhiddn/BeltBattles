// 0.8.0 RC M4 (REQ-BFG-032; the text sheet, output-RC/text-sheet/TEXT-SHEET-0.8.0.md): the one kind of number on the sheet
// that no test read off a battle. A turret core's absolute numbers scale with the class factor of the hero's first gun
// (inspector.ts textOpts: FURNACE 1, WEAVER 0.55, FOUNDRY 0.8, BASTION 0.75; cores.ts scaleCore). tests/abilityText.test.ts
// reads the sentences against the spec at k 1 and 0.55, and tests/wave3.modules.test.ts reads ANVIL BREECH and STEAM
// BREECH in battle on FURNACE's gun. Here every number the ANVIL BREECH panel shows on each playable hero, at 1, 2 and 3
// stars, is read off that hero's own battle: its start deck with the core on its first gun, shot for shot against the same
// deck without it. STEAM BREECH's numbers are rates, which no class factor scales: its text is the same on every hero.
// And TWIN LATCH's damage, which tests/wave3.modules.test.ts reads in battle only as rising star to star: the number its
// text says each payload it lets go gains is the battle's, at every star.
import { describe, expect, it } from "vitest";
import { Battle, type SimEvent } from "../src/sim/battle";
import type { HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { heroStartBuild, PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { abilityText } from "../src/ui/abilityText";
import { newRun } from "../src/game/run";
import { textOpts } from "../src/screens/build/inspector";
import { item, latchDeck, pastTile, withItem } from "./wave3.helpers";

const SEED = 12345;
const barge = (): Build => ({ hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 5 }], routes: [], mods: [], beltCap: 24, hullBonus: 5000 });
const bench = (hero: HeroId, anvil = 0): Build => {
  const b = heroStartBuild(hero);
  return { ...b, hullBonus: b.hullBonus + 5000, mods: anvil ? [...b.mods, { uid: 950, def: "anvil", turret: 0, ...(anvil > 1 ? { stars: anvil } : {}) }] : [...b.mods] };
};

/** Every shot of side 0's first gun over 30 s: its damage and the plating the hull held as it fired (the pool at the
 *  start of the tick, moved by the plate events before the shot). `plate`: plating added at the first tick. */
function shots(b: Build, plate: number): { dmg: number; plate: number }[] {
  const bt = new Battle(b, barge(), SEED);
  const out: { dmg: number; plate: number }[] = [];
  let cur = 0;
  while (bt.t < 30 && !bt.over) {
    bt.step();
    const ev: SimEvent[] = bt.drainEvents();
    for (const e of ev) {
      if (e.type === "plate" && e.side === 0) cur = e.plate;
      if (e.type === "fire" && e.side === 0 && e.turret === 0) out.push({ dmg: e.dmg, plate: cur });
    }
    if (bt.ticks === 1 && plate) bt.addPlate(bt.sides[0], plate);
    cur = bt.sides[0].plate.plate;
  }
  return out;
}

/** ANVIL BREECH's gain a shot on `hero`'s first gun as flat + per x plating: least squares over the shots at the hull's
 *  own plating and at 24 more, each against the same shot without the core. */
function anvilFit(hero: HeroId, stars: number): { flat: number; per: number; worst: number; n: number } {
  const pts: { x: number; y: number }[] = [];
  for (const plate of [0, 24]) {
    const base = shots(bench(hero), plate), withA = shots(bench(hero, stars), plate);
    expect(withA.map((s) => s.plate), `${hero} ★${stars}: the core changes no shot's timing or plating`).toEqual(base.map((s) => s.plate));
    withA.forEach((s, i) => pts.push({ x: s.plate, y: s.dmg - base[i].dmg }));
  }
  const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const per = sxy / sxx, flat = my - per * mx;
  const worst = Math.max(...pts.map((p) => Math.abs(p.y - (flat + per * p.x))));
  return { flat, per, worst, n };
}

/** The two numbers of ANVIL BREECH's sentence as `hero`'s panel shows them (textOpts of a fresh run: its class factor). */
function anvilText(hero: HeroId, stars: number): [number, number] {
  const s = abilityText("anvil", stars, textOpts(newRun(hero, 1))).sentences[0];
  const m = /^EACH SHOT DEALS ([\d.]+) MORE DAMAGE, AND ([\d.]+) MORE FOR EACH PLATING ON YOUR HULL\.$/.exec(s);
  expect(m, `${hero} ★${stars}: ${s}`).not.toBeNull();
  return [Number(m![1]), Number(m![2])];
}

describe("a turret core's numbers on every playable hero's own gun (the text sheet's per-hero cores)", () => {
  it("ANVIL BREECH: the panel's two numbers at 1, 2 and 3 stars are the battle's, on FURNACE, WEAVER, FOUNDRY and BASTION", () => {
    const seen = new Set<string>();
    for (const hero of PLAYABLE_HEROES) for (const stars of [1, 2, 3]) {
      const [flat, per] = anvilText(hero, stars);
      const fit = anvilFit(hero, stars);
      expect(fit.n, `${hero} ★${stars}: shots`).toBeGreaterThanOrEqual(8);
      expect(fit.worst, `${hero} ★${stars}: flat + per x plating explains every shot`).toBeLessThan(1e-6);
      // the panel rounds to one decimal place (0.75 shows 0.8): within half a step of the battle's number
      expect(Math.abs(fit.flat - flat), `${hero} ★${stars} flat: text ${flat}, battle ${fit.flat}`).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(fit.per - per), `${hero} ★${stars} per plating: text ${per}, battle ${fit.per}`).toBeLessThanOrEqual(0.05 + 1e-9);
      seen.add(`${flat}/${per}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(9); // the class factor moves the numbers: not one text for every hero
  }, 120_000);

  it("TWIN LATCH: the damage its text says each payload it lets go gains, at 1, 2 and 3 stars, is the battle's", () => {
    // wave3.modules' headline row reads this damage in battle only as rising (1 star < 2 < 3, inside the band); here every
    // payload past the latch on the two-press deck carries exactly the panel's number
    for (const s of [1, 2, 3]) {
      const said = abilityText("twinlatch", s).sentences.find((x) => x.startsWith("EACH PAYLOAD IT LETS GO GAINS "))!;
      const m = /^EACH PAYLOAD IT LETS GO GAINS ([\d.]+) DAMAGE\.$/.exec(said);
      expect(m, `★${s}: ${said}`).not.toBeNull();
      const flats = pastTile(withItem(latchDeck(), item(40, "twinlatch", 4, 3, 0, s)), 0, 2).map((x) => x.flat);
      expect(flats.length, `★${s}: payloads past the latch`).toBeGreaterThan(3);
      for (const f of flats) expect(f, `★${s}`).toBeCloseTo(Number(m![1]), 9);
    }
  });

  it("STEAM BREECH: its numbers are rates, the same on every hero (tests/wave3.modules.test.ts reads them in battle)", () => {
    for (const stars of [1, 2, 3]) {
      const texts = PLAYABLE_HEROES.map((hero) => abilityText("steambreech", stars, textOpts(newRun(hero, 1))).sentences.join(" "));
      expect(new Set(texts).size, `★${stars}: ${texts[0]}`).toBe(1);
    }
    expect(abilityText("steambreech", 1).sentences[0]).toBe("THE TURRET FIRES 35% FASTER WHILE YOUR HULL HOLDS PLATING, AND 10% FASTER WITHOUT IT.");
  });
});
