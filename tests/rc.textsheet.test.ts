// 0.8.0 RC M4 (REQ-BFG-032; the text sheet, output-RC/text-sheet/TEXT-SHEET-0.8.0.md): the one kind of number on the sheet
// that no test read off a battle. A turret core's absolute numbers scale with the class factor of the hero's first gun
// (inspector.ts textOpts: FURNACE 1, WEAVER 0.55, FOUNDRY 0.8, BASTION 0.75; cores.ts scaleCore). tests/abilityText.test.ts
// reads the sentences against the spec at k 1 and 0.55, and tests/wave3.modules.test.ts reads ANVIL BREECH and STEAM
// BREECH in battle on FURNACE's gun. Here every number the ANVIL BREECH panel shows on each playable hero, at 1, 2 and 3
// stars, is read off that hero's own battle: its start deck with the core on its first gun, shot for shot against the same
// deck without it. STEAM BREECH's numbers are rates, which no class factor scales: its text is the same on every hero.
// And TWIN LATCH's damage, which tests/wave3.modules.test.ts reads in battle only as rising star to star: the number its
// text says each payload it lets go gains is the battle's, at every star.
// And ARMOR PRESS's plain slug: the damage its text names is every slug it stamps in the battle, at every star.
import { describe, expect, it } from "vitest";
import { Battle, type SimEvent } from "../src/sim/battle";
import { AMMO, type HeroId } from "../src/sim/content"; // NUM-1: AMMO (the plain slug's base)
import type { Build } from "../src/sim/deck";
import { heroStartBuild, PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { abilityText } from "../src/ui/abilityText";
import { pct } from "../src/sim/pct"; // NUM-1 (REQ-BFG-047): the one % rule (n x p%, rounded half up once)
import { newRun } from "../src/game/run";
import { textOpts } from "../src/screens/build/inspector";
import { furnaceBench, item, K, latchDeck, pastTile, withItem } from "./wave3.helpers";

const SEED = 12345;
// NUM-1 (REQ-BFG-047): the stand-in hulls' bonus x10 with the hull (was 5000 on both), so the barge outlasts the 30 s bench
const barge = (): Build => ({ hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 5 }], routes: [], mods: [], beltCap: 24, hullBonus: 50000 });
const bench = (hero: HeroId, anvil = 0): Build => {
  const b = heroStartBuild(hero);
  return { ...b, hullBonus: b.hullBonus + 50000, mods: anvil ? [...b.mods, { uid: 950, def: "anvil", turret: 0, ...(anvil > 1 ? { stars: anvil } : {}) }] : [...b.mods] };
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

/** ANVIL BREECH's gain a shot on `hero`'s first gun as flat + per x plating, over the shots at the hull's own plating and
 *  at 240 more, each against the same shot without the core. NUM-1 (REQ-BFG-047, N1 2.1): the gain is whole, flat +
 *  roundHalfUp(plating x per) with per a whole % of the plating (cores.ts scaleCore, Battle.fireCore's pct), so a
 *  least-squares line no longer explains every shot exactly (BASTION's own plating, ★3: per 2.63). It was that line with
 *  its worst residual; it is now every (flat, per) with per a whole % (0 to 10 per plating) under which one flat explains
 *  every shot exactly. */
function anvilFit(hero: HeroId, stars: number): { fits: { flat: number; per: number }[]; n: number } {
  const pts: { x: number; y: number }[] = [];
  for (const plate of [0, 240]) { // NUM-1 (REQ-BFG-047): plating x10 (was 24, the old PLATE_CAP; now 240)
    const base = shots(bench(hero), plate), withA = shots(bench(hero, stars), plate);
    expect(withA.map((s) => s.plate), `${hero} ★${stars}: the core changes no shot's timing or plating`).toEqual(base.map((s) => s.plate));
    withA.forEach((s, i) => pts.push({ x: s.plate, y: s.dmg - base[i].dmg }));
  }
  const fits: { flat: number; per: number }[] = [];
  for (let p = 0; p <= 1000; p++) {
    const flats = new Set(pts.map((q) => q.y - pct(q.x, p)));
    if (flats.size === 1) fits.push({ flat: [...flats][0], per: p / 100 });
  }
  return { fits, n: pts.length };
}

/** The two numbers of ANVIL BREECH's sentence as `hero`'s panel shows them (textOpts of a fresh run: its class factor).
 *  NUM-4 (REQ-BFG-047): the second is the sim's perPlate as a whole % of the hull's plating, "PLUS n% OF THE PLATING ON
 *  YOUR HULL" (abilityText percent(), fmtPct), returned as the share n / 100 the battle's fit reads (was "AND x MORE FOR
 *  EACH PLATING", perPlate to one decimal). */
function anvilText(hero: HeroId, stars: number): [number, number] {
  const s = abilityText("anvil", stars, textOpts(newRun(hero, 1))).sentences[0];
  const m = /^EACH SHOT DEALS ([\d.]+) MORE DAMAGE, PLUS ([\d.]+)% OF THE PLATING ON YOUR HULL\.$/.exec(s);
  expect(m, `${hero} ★${stars}: ${s}`).not.toBeNull();
  return [Number(m![1]), Number(m![2]) / 100];
}

describe("a turret core's numbers on every playable hero's own gun (the text sheet's per-hero cores)", () => {
  it("ANVIL BREECH: the panel's two numbers at 1, 2 and 3 stars are the battle's, on FURNACE, WEAVER, FOUNDRY and BASTION", () => {
    const seen = new Set<string>();
    for (const hero of PLAYABLE_HEROES) for (const stars of [1, 2, 3]) {
      const [flat, per] = anvilText(hero, stars);
      const fit = anvilFit(hero, stars);
      expect(fit.n, `${hero} ★${stars}: shots`).toBeGreaterThanOrEqual(8);
      // NUM-1 (REQ-BFG-047): exact as before (was: the line's worst residual < 1e-6), with the battle's whole-damage rounding
      expect(fit.fits.length, `${hero} ★${stars}: flat + roundHalfUp(per x plating) explains every shot`).toBeGreaterThan(0);
      for (const f of fit.fits) {
        // NUM-1: the flat is whole on the panel and in the battle: the same number (was within 0.05)
        expect(f.flat, `${hero} ★${stars} flat: text ${flat}, battle ${f.flat}`).toBe(flat);
        // NUM-4 (REQ-BFG-047): the panel prints per as the battle keeps it, a whole % of the plating, so the text's % is the
        // battle's exactly (was: the panel rounded per to one decimal place, 0.75 showed 0.8, within half a step, 0.05)
        expect(f.per, `${hero} ★${stars} per plating: text ${per}, battle ${f.per}`).toBe(per);
      }
      seen.add(`${flat}/${per}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(9); // the class factor moves the numbers: not one text for every hero
  }, 120_000);

  // Y7b2 (the flip): retitled, was "TWIN LATCH: the damage its text says each payload it lets go gains, at 1, 2 and 3 stars,
  // is the battle's". Its flat left with the flip (Y3, DESIGN-Y row 30: flat 0, hold 1/2/3 s), so its text names no gain
  // and the battle gives none: the panel still says what the battle does
  it("TWIN LATCH: its text names no gain for a payload it lets go, at 1, 2 and 3 stars, and the battle gives none", () => {
    // wave3.modules' headline row reads this damage in battle only as rising (1 star < 2 < 3, inside the band); here every
    // payload past the latch on the two-press deck carries exactly the panel's number
    for (const s of [1, 2, 3]) {
      // Y7b2 (the flip): no "EACH PAYLOAD IT LETS GO GAINS n DAMAGE." sentence at any star (was its match, n 10 / 22 / 35)
      const said = abilityText("twinlatch", s).sentences.find((x) => x.startsWith("EACH PAYLOAD IT LETS GO GAINS "));
      expect(said, `★${s}`).toBeUndefined();
      const flats = pastTile(withItem(latchDeck(), item(40, "twinlatch", 4, 3, 0, s)), 0, 2).map((x) => x.flat);
      expect(flats.length, `★${s}: payloads past the latch`).toBeGreaterThan(3);
      // Y7b2 (the flip): each carries no flat (was toBeCloseTo(Number(m![1]), 9), the sentence's n)
      for (const f of flats) expect(f, `★${s}`).toBe(0);
    }
  });

  it("ARMOR PRESS: the plain slug's damage its text names, at 1, 2 and 3 stars, is every stamped slug's in the battle", () => {
    // wave3.modules reads the press's plating and its stamping pace in battle; here the slug's damage, as TWIN MOULD's
    // test reads its casts (Payload.base; a plain slug without one is AMMO.plain.base). NUM-1 (REQ-BFG-047): that fallback
    // was the literal 3 (the plain slug's old base); it is the catalogue's AMMO.plain.base now (x10: 30)
    for (const s of [1, 2, 3]) {
      const said = abilityText("armorpress", s).sentences[0];
      const m = /STAMPS A PLAIN SLUG \(([\d.]+) DAMAGE\)/.exec(said);
      expect(m, `★${s}: ${said}`).not.toBeNull();
      const b = furnaceBench();
      b.items.push({ uid: 907, def: "armorpress", x: 6, y: 6, ...(s > 1 ? { stars: s } : {}) });
      b.routes.push({ factory: 907, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
      const bases = new Set<number>(), seen = new Set<number>();
      const bt = new Battle(b, barge(), SEED);
      while (bt.t < 12 && !bt.over) {
        bt.step();
        bt.drainEvents();
        for (const a of bt.sides[0].routes[1].ammo) if (!seen.has(a.p.id)) { seen.add(a.p.id); bases.add(a.p.base ?? AMMO.plain.base); }
      }
      expect(seen.size, `★${s}: slugs stamped`).toBeGreaterThan(3);
      expect([...bases], `★${s}`).toEqual([Number(m![1])]);
    }
  });

  it("STEAM BREECH: its numbers are rates, the same on every hero (tests/wave3.modules.test.ts reads them in battle)", () => {
    for (const stars of [1, 2, 3]) {
      const texts = PLAYABLE_HEROES.map((hero) => abilityText("steambreech", stars, textOpts(newRun(hero, 1))).sentences.join(" "));
      expect(new Set(texts).size, `★${stars}: ${texts[0]}`).toBe(1);
    }
    // Y7b2 (the flip): plated 40% at ★1 and no bare speed-up (Y4, DESIGN-Y row 39; was "THE TURRET FIRES 35% FASTER WHILE
    // YOUR HULL HOLDS PLATING, AND 10% FASTER WITHOUT IT.")
    expect(abilityText("steambreech", 1).sentences[0]).toBe("THE TURRET FIRES 40% FASTER WHILE YOUR HULL HOLDS PLATING.");
  });
});
