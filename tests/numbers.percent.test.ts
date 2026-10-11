// NUM-2 (REQ-BFG-047, N1 2.3): whole rate %s. "X% FASTER" always means the speed goes up X%: the sim stores the whole X
// (mod.fireRate: CALIBRATION, ESCAPEMENT; core.fireRate: ROTARY; core.steamPlated / steamBare: STEAM BREECH; core.start /
// top: GATLING; factory.rate: MIMIC FORGE; FURNACE's long belt) and multiplies the speed by (100 + X) / 100 inside the one
// rounding (Battle.makeTurret, cores.ts steamInterval / spinInterval, content.ts factorySpeed), so the placed panel's speed
// is the battle's. Each shown % is the stored X (parsed from what the face or the text prints), and the sim's multiplier
// is recomputed from that printed X and compared with ===. The belt states and STOKER are pinned as whole %s.
import { describe, expect, it } from "vitest";
import { HEROES, ITEMS, rateMul, secPer, factorySpeed, type HeroId } from "../src/sim/content";
import { Battle, FURNACE_LONG_BELT, gearStats, type TurretState } from "../src/sim/battle";
import { spinInterval, steamInterval } from "../src/sim/cores";
import { cloneBuild, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { effectAt } from "../src/sim/stars";
import { faceAt } from "../src/ui/faces";
import { abilityText, heroTrick } from "../src/ui/abilityText";
import { captureFormats } from "../src/ui/statFormat";
import { barge, SEED } from "./arsenal.bench";
import { withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): bb-0.9.7's STOKER ★3 beside the shipped one

const roundHalfUp = (x: number): number => Math.floor(x + 0.5 + 1e-9);
/** The whole %s a piece's face prints (its fmtPct records), as numbers. */
const shownPcts = (def: string, stars: number): number[] =>
  captureFormats(() => faceAt(def, stars)).records.filter((r) => r.unit === "pct").map((r) => Number(r.printed.replace("%", "")));
/** The "N% FASTER" / "N% SLOWER" numbers of a text, signed; "R TIMES AS FAST" (abilityText faster() from 2x up) as its %,
 *  (R - 1) x 100. */
const textPcts = (s: string): number[] => [...s.matchAll(/(\d+)% (FASTER|SLOWER)|([\d.]+) TIMES AS FAST/g)].map((m) =>
  m[3] !== undefined ? Math.round((Number(m[3]) - 1) * 100) : (m[2] === "SLOWER" ? -1 : 1) * Number(m[1]));

/** WEAVER's starting deck (DART GUN, speed 55; no long-belt rule) with `def` at `stars` on turret 0: that turret's state. */
function fitted(def: string, stars: number): { tu: TurretState; base: number } {
  const b: Build = cloneBuild(heroStartBuild("weaver", 1));
  b.mods.push({ uid: 777, def, turret: 0, stars });
  const tu = new Battle(b, barge(), SEED).sides[0].turrets.find((t) => t.index === 0)!;
  return { tu, base: tu.def.speed };
}

describe("NUM-2: whole rate %s (N1 2.3), each shown % exact against the sim's multiplier", () => {
  it("CALIBRATION +33 / +72 / +117 and ESCAPEMENT +11 / +16 / +22: the face's %, gearStats' multiplier, the battle's speed", () => {
    for (const [def, want] of [["calibrate", [33, 72, 117]], ["escapement", [11, 16, 22]]] as [string, number[]][]) {
      for (const s of [1, 2, 3]) {
        expect(effectAt(def, s).mod!.fireRate, `${def} ★${s}`).toBe(want[s - 1]);
        const [x] = shownPcts(def, s);
        expect(x, `${def} ★${s} face`).toBe(want[s - 1]);
        const b = cloneBuild(heroStartBuild("weaver", 1));
        b.mods.push({ uid: 777, def, turret: 0, stars: s });
        expect(gearStats(b, 0).speedMul, `${def} ★${s}`).toBe((100 + x) / 100);
        const { tu, base } = fitted(def, s);
        expect([tu.speedRaw, tu.speed, tu.interval], `${def} ★${s}`).toEqual([base * ((100 + x) / 100), roundHalfUp(base * ((100 + x) / 100)), secPer(tu.speed)]);
      }
    }
  });

  // Y7b2 (the flip): the test "ROTARY ★2 +18, ★3 +43 (★1 none): the clause's % and the battle's speed" is deleted: ROTARY's
  // fire rate is gone (Y4: its star number is its load time, 50% / 65% / 80% sooner)

  // Y7b2 (the flip): Y4's STEAM BREECH: +40 / +80 / +120 plated and no bare speed-up (was +35 / +70 / +110 plated, +10 / +20 /
  // +30 bare), so bare it fires at the turret's own pace (its bare cadence re-pinned to +0). Was "STEAM BREECH +35 / +70 / +110
  // plated, +10 / +20 / +30 bare: its text's %s and its cadence (cores.ts steamInterval)"
  it("STEAM BREECH +40 / +80 / +120 plated, nothing bare: its text's %s and its cadence (cores.ts steamInterval)", () => {
    const plated = [40, 80, 120]; // Y7b2 (the flip): was [35, 70, 110], and bare [10, 20, 30]
    for (const s of [1, 2, 3]) {
      const c = effectAt("steambreech", s).core!;
      expect([c.steamPlated, c.steamBare], `★${s}`).toEqual([plated[s - 1], undefined]); // Y7b2 (the flip): was [plated, bare]
      const shown = textPcts(abilityText("steambreech", s).sentences.join(" "));
      // Y7b2 (the flip): the text names the plated % only (was [plated, bare])
      expect(shown, `★${s}: ${abilityText("steambreech", s).sentences.join(" ")}`).toEqual([plated[s - 1]]);
      const { tu } = fitted("steambreech", s);
      for (const [on, x] of [[true, shown[0]], [false, 0]] as [boolean, number][]) { // Y7b2 (the flip): bare was shown[1]
        tu.plated = on;
        expect(steamInterval(tu), `★${s} plated ${on}`).toBe(secPer(Math.max(1, roundHalfUp(tu.speedRaw * ((100 + x) / 100)))));
      }
    }
  });

  it("GATLING starts -17 and spins up to +67 / +150 / +245: the face's %, its first and fastest cadence (cores.ts spinInterval)", () => {
    const top = [67, 150, 245];
    for (const s of [1, 2, 3]) {
      const c = effectAt("gatling", s).core!;
      expect([c.start, c.top], `★${s}`).toEqual([-17, top[s - 1]]);
      expect(shownPcts("gatling", s), `★${s}`).toContain(top[s - 1]);
      const { tu } = fitted("gatling", s);
      expect(tu.spin).toBe(1 / ((100 - 17) / 100));
      expect(spinInterval(tu), `★${s} first`).toBe(secPer(roundHalfUp(tu.speedRaw / (100 / 83))));
      tu.spin = 1 / ((100 + top[s - 1]) / 100);
      expect(spinInterval(tu), `★${s} full spin`).toBe(secPer(roundHalfUp(tu.speedRaw / (100 / (100 + top[s - 1])))));
    }
  });

  it("MIMIC FORGE -29 / 0 / +25 on the hero factory's speed, rounded once: its text's %, the battle's factory", () => {
    const want = [-29, 0, 25];
    for (const s of [1, 2, 3]) {
      const fs = effectAt("mimic", s).factory!;
      expect(fs.rate ?? 0, `★${s}`).toBe(want[s - 1]);
      const text = abilityText("mimic", s, { hero: "furnace" }).sentences.join(" ");
      if (want[s - 1]) expect(textPcts(text)[0], text).toBe(want[s - 1]); // "STAMPS ... 29% SLOWER THAN ITS OWN FACTORY."
      for (const hero of ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"] as HeroId[]) {
        const sig = ITEMS[HEROES[hero].factory].factory!.speed;
        const sp = factorySpeed("mimic", fs, hero);
        expect(sp, `★${s} ${hero}`).toBe(roundHalfUp(sig * ((100 + want[s - 1]) / 100)));
        const b: Build = { hero, items: [{ uid: 7, def: "mimic", x: 4, y: 6, stars: s }], routes: [{ factory: 7, cells: [4 * 10 + 5] }], mods: [], beltCap: 40, hullBonus: 0 };
        const f = new Battle(b, barge(), SEED).sides[0].factories.find((x) => x.uid === 7);
        if (f) expect(f.def.factory!.speed, `★${s} ${hero} battle`).toBe(sp);
      }
    }
  });

  it("FURNACE's long belt: +39% (its hero text), the speed x 139 / 100 in the one rounding", () => {
    expect(FURNACE_LONG_BELT).toBe(39);
    expect(textPcts(heroTrick("furnace"))).toEqual([39]);
    expect(rateMul(FURNACE_LONG_BELT)).toBe((100 + 39) / 100);
  });

  // Y7b2 (the flip): Y3's BRAKE SHOE slows to 50% / 40% / 30% (was 50% at every star). Was "belt states: GREASE +60 / +130 /
  // +210%, BRAKE 50%, OVERDRIVE x3 / x4 / x5; STOKER +20 / +44 / +70% (already rates)"
  it("belt states: GREASE +60 / +130 / +210%, BRAKE 50% / 40% / 30%, OVERDRIVE x3 / x4 / x5; STOKER +20 / +44 / +70% (already rates)", () => {
    // AZ-BUMP (the flip, LADDER_FIX): STOKER ★3 70 -> 85, the star-ladder pass's ★3 stoke 0.85 (was 0.7); off, 70 (below)
    const grease = [60, 130, 210], brake = [50, 40, 30], stoke = [20, 44, 85];
    for (const s of [1, 2, 3]) {
      const g = effectAt("grease", s).gate!.speed!;
      expect(shownPcts("grease", s), `GREASE ★${s}`).toEqual([grease[s - 1]]);
      expect(g, `GREASE ★${s}`).toBe((100 + grease[s - 1]) / 100);
      expect(effectAt("brake", s).gate!.speed).toBe(brake[s - 1] / 100); // Y7b2 (the flip): was 50 / 100
      expect(shownPcts("brake", s)[0], `BRAKE ★${s}`).toBe(brake[s - 1]); // Y7b2 (the flip): was 50
      expect(effectAt("overdrive", s).gate!.speed).toBe(s + 2);
      const k = effectAt("stoker", s).gate!.stoke!;
      expect(shownPcts("stoker", s), `STOKER ★${s}`).toEqual([stoke[s - 1]]);
      expect(Math.abs(k * 100 - stoke[s - 1]), `STOKER ★${s}`).toBeLessThan(1e-9);
    }
    expect(withLadderFix(() => [shownPcts("stoker", 3), effectAt("stoker", 3).gate!.stoke], false)).toEqual([[70], 0.7]);
  });
});
