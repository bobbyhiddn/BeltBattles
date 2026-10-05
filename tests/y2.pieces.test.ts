// Y2 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, rows 8-19): THE 12 STUN PIECES with the star switch on
// (content.ts STAR_RULES, withStarRules). For each: its sim change, read off a real battle or the hook it changes, the
// same scene with the switch off where the base differs; its face (one ability line at every star, inside the 225 px band
// of font.ts textWidth, no caveat and no star clause, its perk's name never on the face: ruling R-1); and its ⓘ LEVELS
// ladder. Every number comes from the sim's data through the formatters (the switch's own data where it changes).
import { describe, expect, it } from "vitest";
import { Battle, type Payload, type Projectile, type SideState, type Target } from "../src/sim/battle";
import { CELL, DISRUPT_TIME, withStarRules, type HarassCause } from "../src/sim/content";
import { type Build } from "../src/sim/deck";
import { type HarassRound } from "../src/sim/harassment";
import { starField } from "../src/sim/stars";
import { faceAt } from "../src/ui/faces";
import { faceBlocks } from "../src/screens/build/faceBlocks";
import { levelLines, levelText } from "../src/screens/build/levels";
import { icons, textWidth } from "../src/render/font";
import { statRow } from "../src/ui/icons";
import { glossaryText } from "../src/ui/glossary";
import { barge, bench } from "./arsenal.bench";

export const BAND = 225; // TEXT-STYLE 11.1-11.2: one line of 5x7 on the op view's band (NEXT_LINE_W, GLOSSARY_WRAP_W)
const STARS = [1, 2, 3] as const;

// ------------------------------------------------------------------------------------------------------ helpers
const on = <T>(fn: () => T): T => withStarRules(fn);
/** The face's rule lines (markup) at each star, with the switch on (or off). */
export const lines = (def: string, star = true): string[][] =>
  withStarRules(() => STARS.map((s) => faceAt(def, s)!.rules.map((r) => r.text)), star);
export const px = (markup: string): number => textWidth(icons(markup));
/** The ⓘ LEVELS lines at `stars` in text form (levels.ts levelText: the current value [marked]). */
export const levels = (def: string, stars = 1, star = true): string[] =>
  withStarRules(() => levelLines(def, stars)!.map((l) => levelText(l)), star);
/** The checks every Y2 face passes with the switch on: one line at each star inside the band; no clause, no caveat; no
 *  perk name on the face blocks (R-1). */
function oneLine(def: string): void {
  on(() => {
    for (const s of STARS) {
      const f = faceAt(def, s)!;
      expect(f.rules, `${def} ★${s}`).toHaveLength(1);
      expect(px(f.rules[0].text), `${def} ★${s}: ${f.rules[0].text}`).toBeLessThanOrEqual(BAND);
      expect(f.clause, `${def} ★${s} clause`).toBeUndefined();
      expect(f.caveats, `${def} ★${s} caveats`).toBeUndefined();
      expect(faceBlocks(def, s, {})!.some((b) => b.perk), `${def} ★${s} perk on the face`).toBe(false);
    }
  });
}

const payload = (id = 900): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false });
const target = (s: SideState, kind: Target["kind"], ref: number, cell = -1): Target => {
  const t = s.targets.find((x) => x.kind === kind && x.ref === ref && x.cell === cell);
  if (!t) throw new Error(`missing ${kind} ${ref}:${cell}`);
  return t;
};
type Probe = {
  disrupt(s: SideState, t: Target, secs: number, cause: HarassCause): boolean;
  rip(s: SideState, t: Target, count: number, reach: number): number;
  roundImpact(s: SideState, t: Target, round: HarassRound, from: 0 | 1): void;
  impact(pr: Projectile): void;
};
export const probe = (bt: Battle) => bt as unknown as Probe;
/** Side 1 is `def` with its factories held; side 0 is `atk` (a WEAVER barge by default). */
export function quiet(def: Build = bench(), atk: Build = barge(), seed = 8): Battle {
  const bt = new Battle(atk, def, seed);
  for (const f of bt.sides[1].factories) f.timer = 1000;
  return bt;
}
/** The bench (FURNACE, one belt (4,5)-(4,0) into its turret) with factory `def` at ★`stars` in the KILN's place (uid 1). */
export function factoryBench(def: string, stars = 1, gates: [string, number, number, number][] = []): Build {
  const b = bench(gates);
  b.items[0] = { uid: 1, def, x: 4, y: 6, ...starField(stars) };
  return b;
}

// --------------------------------------------------------------------------------------------- row 8: TOLLBOOTH
describe("Y2 row 8: TOLLBOOTH blocks STUNs on its belt's parts, its factory from ★1", () => {
  it("sim: on, its ★1 toll covers its belt's factory (off: ★3 FACTORY GUARD only); a wreck or a rip passes (the shared rule)", () => {
    for (const star of [true, false]) withStarRules(() => {
      const bt = quiet(bench([["tollbooth", 4, 3, 1]])), s = bt.sides[1], g = s.gates[0], f = s.factories[0];
      g.online = true;
      const landed = probe(bt).disrupt(s, target(s, "factory", f.uid), DISRUPT_TIME, "shock");
      expect([landed, g.tolls, f.disrupted > 0], star ? "on" : "off").toEqual(star ? [false, 1, false] : [true, 2, true]);
    }, star);
  });

  it("face: BLOCKS 2/4/7 STUN ON ITS BELT'S PARTS, one line in the band; ladder BLOCKS 2/4/7", () => {
    expect(lines("tollbooth")).toEqual([2, 4, 7].map((n) => [`BLOCKS ${n} {*STUN} ON ITS BELT'S PARTS.`]));
    oneLine("tollbooth");
    expect(levels("tollbooth", 1)).toEqual(["BLOCKS [2]/4/7", "★3 FACTORY GUARD", "NEXT ★2: BLOCKS 4"]);
    expect(levels("tollbooth", 3)).toEqual(["BLOCKS 2/4/[7]", "★3 FACTORY GUARD"]);
    // off: the base's face, its two caveats and ★3's clause (identity)
    expect(lines("tollbooth", false)[0]).toEqual(["BLOCKS THE FIRST 2 {*STUN} HITS ON ITS BELT."]);
    expect(withStarRules(() => faceAt("tollbooth", 3)!.clause?.text, false)).toBe("★3 FACTORY GUARD: THE BELT'S FACTORY.");
  });
});

// ---------------------------------------------------------------------------------------------- row 9: SCRAPPER
describe("Y2 row 9: SCRAPPER counts STUNs only, with no queue cap and no BIG HAUL", () => {
  /** A SCRAPPER at ★`stars` feeding the bench's belt; its trigger stamps held (cooldown), one tick after its side's
   *  counts are set: the queue it took. */
  const queue = (stars: number, harass: number, wrecks: number, star: boolean): number => withStarRules(() => {
    const bt = new Battle(factoryBench("scrapper", stars), barge(), 8), s = bt.sides[0], f = s.factories[0];
    f.triggerCooldown = 1000;
    s.harassAccepted = harass;
    s.wreckAccepted = wrecks;
    bt.step();
    return f.triggerQueue;
  }, star);

  it("sim: on, 5 STUNs landed queue 5 stamps (off: MAX 3); ★3 queues nothing for 2 wrecks (off: BIG HAUL's 2)", () => {
    expect([queue(1, 5, 0, true), queue(1, 5, 0, false)]).toEqual([5, 3]);
    expect([queue(3, 0, 2, true), queue(3, 0, 2, false)]).toEqual([0, 2]);
  });

  it("face: +1 SLUG FOR EACH STUN YOU LAND, no caveat, no BIG HAUL clause; ladders RATE 10/12/15, DMG 60/95/135", () => {
    expect(lines("scrapper")).toEqual(STARS.map(() => ["+1 {SLUG} FOR EACH {*STUN} YOU LAND."]));
    oneLine("scrapper");
    expect(levels("scrapper", 1)).toEqual(["{RATE} [10]/12/15", "{DMG} [60]/95/135", "{BELT} [2]/3/4", "★3 BIG HAUL",
      `NEXT ★2: ${statRow([["RATE", "12"], ["DMG", "95"], ["BELT", "3"]])}`]); // NEXT★'s changed stats are a stat row (glyphs)
    expect(withStarRules(() => faceAt("scrapper", 1)!.caveats, false)).toEqual(["WRECKS AND RIPS COUNT TOO.", "MAX 3 SLUGS WAITING."]);
  });
});

// ------------------------------------------------------------------------------------------- row 10: FLAK SCREEN
describe("Y2 row 10: FLAK SCREEN downs STUN shots only, each screen rolling on its own", () => {
  it("sim: on, a side's screens are listed one by one (off: only the best counts, no list)", () => {
    const b = bench([], [["flak", 2]]);
    expect(withStarRules(() => new Battle(barge(), b, 1).sides[1].flaks)).toEqual([0.55]);
    expect(new Battle(barge(), b, 1).sides[1].flaks).toBeUndefined();
    expect(new Battle(barge(), b, 1).sides[1].flak).toBe(0.55);
  });

  it("sim: two 50% screens down about 3 in 4 FROST rounds on, as each rolls; off, the best's 1 in 2 (400 seeded shots)", () => {
    const downed = (star: boolean): number => withStarRules(() => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const atk = barge(), bt = new Battle(atk, barge(), seed), tu = bt.sides[0].turrets[0], p = payload();
        p.harass = { kind: "frost", seconds: 2 };
        tu.stack.push(p);
        tu.phase = "fire";
        bt.step();
        const d = bt.sides[1];
        d.flak = 0.5;
        if (star) d.flaks = [0.5, 0.5];
        while (bt.projectiles.length) bt.step();
        if (bt.events.some((e) => e.type === "flak")) n++;
      }
      return n / 400;
    }, star);
    const [a, b] = [downed(true), downed(false)];
    expect(a).toBeGreaterThan(0.68);
    expect(a).toBeLessThan(0.82);
    expect(b).toBeGreaterThan(0.43);
    expect(b).toBeLessThan(0.57);
  });

  it("face: SHOOTS DOWN 25% OF ENEMY STUN SHOTS, no caveat; ladder SHOOTS DOWN 25%/55%/85%", () => {
    expect(lines("flak")).toEqual(["25%", "55%", "85%"].map((p) => [`SHOOTS DOWN ${p} OF ENEMY {*STUN} SHOTS.`]));
    oneLine("flak");
    expect(levels("flak", 2)).toEqual(["SHOOTS DOWN 25%/[55%]/85%", "NEXT ★3: SHOOTS DOWN 85%"]);
    expect(withStarRules(() => faceAt("flak", 1)!.caveats, false)).toEqual(["ALSO GRAPNEL, LANCE AND LIMPET SHOTS.", "ONLY YOUR BEST FLAK SCREEN COUNTS."]);
  });
});

// ---------------------------------------------------------------------------------------- row 19: GRAPNEL GUN ★3
describe("Y2 row 19: GRAPNEL GUN ★3 drops SALVAGE, and a hit keg is no longer disarmed", () => {
  /** Side 0 fits a GRAPNEL GUN at ★`stars`; its shot (rip 3, reach 3) lands on side 1's belt tile 2, where 2 slugs ride;
   *  `gate`: a rig of side 1 to aim at instead. Returns the battle after the impact. */
  function ripShot(stars: number, star: boolean, gates: [string, number, number, number][] = [], at?: "gate"): Battle {
    return withStarRules(() => {
      const atk = barge();
      atk.mods.push({ uid: 20, def: "grapnel", turret: 0, ...starField(stars) });
      const bt = new Battle(atk, bench(gates), 8), d = bt.sides[1];
      for (const f of d.factories) f.timer = 1000;
      for (const g of d.gates) g.online = true;
      d.routes[0].ammo.push({ p: payload(11), s: 2 * CELL + 5, processed: 1, blocked: false },
        { p: payload(12), s: 2 * CELL + 1, processed: 1, blocked: false });
      const tu = bt.sides[0].turrets[0], p = payload();
      tu.stack.push(p);
      tu.phase = "fire";
      bt.step();
      const pr = bt.projectiles[0];
      const t = at === "gate" ? target(d, "gate", d.gates[0].uid) : target(d, "belt", 0, 2);
      bt.projectiles.length = 0;
      probe(bt).impact({ ...pr, target: t, tx: t.x, ty: t.y });
      return bt;
    }, star);
  }

  it("sim: on, a ★3 shot that rips 2 slugs banks no salvage (off: its next shot's +10 for each, x the class)", () => {
    const a = ripShot(3, true), b = ripShot(3, false);
    expect(a.sides[1].routes[0].ammo).toHaveLength(0);
    expect(b.sides[1].routes[0].ammo).toHaveLength(0);
    expect(a.sides[0].turrets[0].salvage).toBe(0);
    expect(b.sides[0].turrets[0].salvage).toBeGreaterThan(0);
  });

  it("sim: on, a shot at a POWDER KEG rips the slugs by its tile and leaves it armed (off: it disarms it)", () => {
    const a = ripShot(1, true, [["keg", 4, 3, 1]], "gate"), b = ripShot(1, false, [["keg", 4, 3, 1]], "gate");
    expect([a.sides[1].gates[0].consumed, b.sides[1].gates[0].consumed]).toEqual([false, true]);
    expect(a.events.filter((e) => e.type === "rip")).toHaveLength(1);
  });

  it("face: RIPS 1/2/3 SLUG(S), no SALVAGE LINE clause at ★3; ladder RIPS 1/2/3; the tap drops the keg", () => {
    expect(lines("grapnel")).toEqual([["SHOT: RIPS 1 SLUG OFF AN ENEMY BELT."], ["SHOT: RIPS 2 SLUGS OFF AN ENEMY BELT."], ["SHOT: RIPS 3 SLUGS OFF AN ENEMY BELT."]]);
    oneLine("grapnel");
    expect(levels("grapnel", 1)).toEqual(["RIPS [1]/2/3", "★3 SALVAGE LINE", "NEXT ★2: RIPS 2"]);
    expect(on(() => glossaryText("SHOT", { def: "grapnel", stars: 1 }))).toBe("SHOT: IT RIPS THE NEAREST SLUGS WITHIN 1 TILE OF A HIT.");
    expect(glossaryText("SHOT", { def: "grapnel", stars: 1 })).toBe("SHOT: IT RIPS THE NEAREST SLUGS WITHIN 1 TILE OF A HIT; A HIT KEG IS DISARMED.");
    expect(withStarRules(() => faceAt("grapnel", 3)!.clause?.text, false)).toMatch(/^★3 SALVAGE LINE: NEXT SHOT \+/);
  });
});
