// Y2 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, rows 8-19): THE 12 STUN PIECES with the star switch on
// (content.ts STAR_RULES, withStarRules). For each: its sim change, read off a real battle or the hook it changes, the
// same scene with the switch off where the base differs; its face (one ability line at every star, inside the 225 px band
// of font.ts textWidth, no caveat and no star clause, its perk's name never on the face: ruling R-1); and its ⓘ LEVELS
// ladder. Every number comes from the sim's data through the formatters (the switch's own data where it changes).
import { describe, expect, it } from "vitest";
import { Battle, gearStats, type Payload, type Projectile, type SideState, type Target, type TurretState } from "../src/sim/battle";
import { CELL, DISRUPT_TIME, TICK, type HarassCause } from "../src/sim/content";
import { shotFloor, type Build } from "../src/sim/deck";
import { type HarassRound } from "../src/sim/harassment";
import { effectAt, starField } from "../src/sim/stars";
import { faceAt, hasFace } from "../src/ui/faces";
import { faceBlocks } from "../src/screens/build/faceBlocks";
import { levelLines, levelText } from "../src/screens/build/levels";
import { icons, textWidth } from "../src/render/font";
import { colourize, wrapRich } from "../src/ui/richText"; // WORDS-1: a face line's two lines (lines2)
import { C } from "../src/render/palette"; // WORDS-1
import { statRow } from "../src/ui/icons";
import { glossaryText } from "../src/ui/glossary";
import { fmtSec } from "../src/ui/statFormat"; // CARD-2 (REQ-BFG-081, K3 g): SABOT's STUN seconds on its second line
import { barge, bench } from "./arsenal.bench";

export const BAND = 225; // TEXT-STYLE 11.1-11.2: one line of 5x7 on the op view's band (NEXT_LINE_W, GLOSSARY_WRAP_W)
const STARS = [1, 2, 3] as const;

// ------------------------------------------------------------------------------------------------------ helpers
/** The face's rule lines (markup) at each star. */
export const lines = (def: string): string[][] => STARS.map((s) => faceAt(def, s)!.rules.map((r) => r.text));
export const px = (markup: string): number => textWidth(icons(markup));
/** The ⓘ LEVELS lines at `stars` in text form (levels.ts levelText: the current value [marked]). */
export const levels = (def: string, stars = 1): string[] => levelLines(def, stars)!.map((l) => levelText(l));
/** The checks every Y2 face passes: one line at each star inside the band; no clause, no caveat; no perk name on the face
 *  blocks (R-1). */
/** WORDS-1 (REQ-BFG-081; READ-1 6.1, measured in its round D; the brief's design call 3): a face line that READ-1's plain
 *  words take past the op band's one line wraps (TEXT-STYLE 8.2: wrapRich at draw time) and must fit two lines of 5x7 at the
 *  band's width; everything else oneLine checks stays as it was. */
function lines2(markup: string): number {
  return wrapRich(colourize(icons(markup), C.bone), BAND, "5").length;
}
function oneLine(def: string, lines = 1): void {
  for (const s of STARS) {
    const f = faceAt(def, s)!;
    expect(f.rules, `${def} ★${s}`).toHaveLength(1);
    if (lines > 1) expect(lines2(f.rules[0].text), `${def} ★${s}: ${f.rules[0].text}`).toBeLessThanOrEqual(lines); // WORDS-1
    else expect(px(f.rules[0].text), `${def} ★${s}: ${f.rules[0].text}`).toBeLessThanOrEqual(BAND);
    expect(f.clause, `${def} ★${s} clause`).toBeUndefined();
    expect(f.caveats, `${def} ★${s} caveats`).toBeUndefined();
    expect(faceBlocks(def, s, {})!.some((b) => b.perk), `${def} ★${s} perk on the face`).toBe(false);
  }
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
  pickTarget(foe: SideState, special: boolean, turret?: TurretState): Target;
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
    const bt = quiet(bench([["tollbooth", 4, 3, 1]])), s = bt.sides[1], g = s.gates[0], f = s.factories[0];
    g.online = true;
    const landed = probe(bt).disrupt(s, target(s, "factory", f.uid), DISRUPT_TIME, "shock");
    expect([landed, g.tolls, f.disrupted > 0]).toEqual([false, 1, false]);
  });

  it("face: BLOCKS 2/4/7 STUN ON ITS BELT'S PARTS, one line in the band; ladder BLOCKS 2/4/7", () => {
    // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D: BLOCKS 2 read as 2 seconds): the first n each fight do nothing; two lines
    // of the op band (329 px), its PARTS tappable (was `BLOCKS ${n} {*STUN} ON ITS BELT'S PARTS.`)
    expect(lines("tollbooth")).toEqual([2, 4, 7].map((n) => [`THE FIRST ${n} {*STUN} ON ITS BELT'S PARTS EACH FIGHT DO NOTHING.`]));
    oneLine("tollbooth", 2); // WORDS-1 (REQ-BFG-081): READ-1 6.1's plain words, two lines of the band (was one)
    expect(levels("tollbooth", 1)).toEqual(["FIRST [2]/4/7", "NEXT ★2: FIRST 4"]); // WORDS-1: its key's words, FIRST (was BLOCKS) // Y7b2 (the words): was ["BLOCKS [2]/4/7", "★3 FACTORY GUARD", "NEXT ★2: BLOCKS 4"] (the name left with its rule)
    expect(levels("tollbooth", 3)).toEqual(["FIRST 2/4/[7]"]); // WORDS-1: FIRST (was BLOCKS) // Y7b2 (the words): was ["BLOCKS 2/4/[7]", "★3 FACTORY GUARD"]
  });
});

// ---------------------------------------------------------------------------------------------- row 9: SCRAPPER
describe("Y2 row 9: SCRAPPER counts STUNs only, with no queue cap and no BIG HAUL", () => {
  /** A SCRAPPER at ★`stars` feeding the bench's belt; its trigger stamps held (cooldown), one tick after its side's
   *  counts are set: the queue it took. */
  const queue = (stars: number, harass: number, wrecks: number): number => {
    const bt = new Battle(factoryBench("scrapper", stars), barge(), 8), s = bt.sides[0], f = s.factories[0];
    f.triggerCooldown = 1000;
    s.harassAccepted = harass;
    (s as { wreckAccepted?: number }).wreckAccepted = wrecks; // Y7b2 (the flip): the field is gone (BIG HAUL's, switch-off only); set as before
    bt.step();
    return f.triggerQueue;
  };

  it("sim: on, 5 STUNs landed queue 5 stamps (off: MAX 3); ★3 queues nothing for 2 wrecks (off: BIG HAUL's 2)", () => {
    expect(queue(1, 5, 0)).toBe(5);
    expect(queue(3, 0, 2)).toBe(0);
  });

  it("face: +1 SLUG FOR EACH STUN YOU LAND, no caveat, no BIG HAUL clause; ladders RATE 10/12/15, DMG 60/95/135", () => {
    // CARD-2 (REQ-BFG-081, K3 g): the trigger first, READ-2 7.1's words (was "+1 {SLUG} FOR EACH {*STUN} YOU LAND.")
    expect(lines("scrapper")).toEqual(STARS.map(() => ["EACH {*STUN} YOU LAND: 1 EXTRA {SLUG}."]));
    oneLine("scrapper");
    // Y7b2 (the words): was [..., "{BELT} [2]/3/4", "★3 BIG HAUL", `NEXT ★2: ...`] (the name left with its rule)
    expect(levels("scrapper", 1)).toEqual(["{RATE} [10]/12/15", "{DMG} [60]/95/135", "{BELT} [2]/3/4",
      `NEXT ★2: ${statRow([["RATE", "12"], ["DMG", "95"], ["BELT", "3"]])}`]); // NEXT★'s changed stats are a stat row (glyphs)
  });
});

// ------------------------------------------------------------------------------------------- row 10: FLAK SCREEN
describe("Y2 row 10: FLAK SCREEN downs STUN shots only, each screen rolling on its own", () => {
  it("sim: on, a side's screens are listed one by one (off: only the best counts, no list)", () => {
    const b = bench([], [["flak", 2]]);
    expect(new Battle(barge(), b, 1).sides[1].flaks).toEqual([0.55]);
  });

  it("sim: two 50% screens down about 3 in 4 FROST rounds on, as each rolls; off, the best's 1 in 2 (400 seeded shots)", () => {
    const downed = (): number => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const atk = barge(), bt = new Battle(atk, barge(), seed), tu = bt.sides[0].turrets[0], p = payload();
        p.harass = { kind: "frost", seconds: 2 };
        tu.stack.push(p);
        tu.phase = "fire";
        bt.step();
        const d = bt.sides[1];
        d.flaks = [0.5, 0.5]; // Y7b2 (the flip): `d.flak = 0.5` dropped (SideState.flak is gone; the switch-on roll read flaks)
        while (bt.projectiles.length) bt.step();
        if (bt.events.some((e) => e.type === "flak")) n++;
      }
      return n / 400;
    };
    const a = downed();
    expect(a).toBeGreaterThan(0.68);
    expect(a).toBeLessThan(0.82);
  });

  it("face: SHOOTS DOWN 25% OF ENEMY STUN SHOTS, no caveat; ladder SHOOTS DOWN 25%/55%/85%", () => {
    expect(lines("flak")).toEqual(["25%", "55%", "85%"].map((p) => [`SHOOTS DOWN ${p} OF ENEMY {*STUN} SHOTS.`]));
    oneLine("flak");
    expect(levels("flak", 2)).toEqual(["SHOOTS DOWN 25%/[55%]/85%", "NEXT ★3: SHOOTS DOWN 85%"]);
  });
});

// ------------------------------------------------------------------------------------------ row 11: SABOT FOUNDRY
describe("Y2 row 11: SABOT FOUNDRY ★3 drops SHRAPNEL and works at RATE 20", () => {
  const round3 = () => effectAt("sabot", 3).factory!.round as Extract<HarassRound, { kind: "sabot" }>;

  it("sim: on, a ★3 SABOT stamps at RATE 20 (off 16) and its round on a belt tile STUNs that tile only (off: 2 s either side)", () => {
    expect(new Battle(factoryBench("sabot", 3), barge(), 8).sides[0].factories[0].def.factory!.speed).toBe(20);
    const bt = quiet(), s = bt.sides[1], r = s.routes[0];
    probe(bt).roundImpact(s, target(s, "belt", 0, 3), round3(), 0);
    expect(r.cellDisrupt[3]).toBeCloseTo(4, 9);
    expect([r.cellDisrupt[2] > 0, r.cellDisrupt[4] > 0]).toEqual([false, false]);
  });

  it("face: ITS ROUNDS WRECK RIGS FOR THE FIGHT at every star, no SHRAPNEL clause; ladder RATE 5/11/20", () => {
    // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D: WRECK): plain words (was "ITS ROUNDS WRECK RIGS FOR THE FIGHT.")
    // CARD-2 (REQ-BFG-081, K3 g; READ-2 7.4: two effects under one icon): both, a line each (was ["ITS ROUNDS STOP AN ENEMY
    // RIG FOR THE WHOLE FIGHT."])
    expect(lines("sabot")).toEqual(STARS.map((s) => ["A RIG IT HITS STOPS FOR THE WHOLE FIGHT.", `ANY OTHER PART IT HITS: {*STUN} ${fmtSec((effectAt("sabot", s).factory!.round as { seconds: number }).seconds)}{SEC}.`]));
    // WORDS-1 (REQ-BFG-081): READ-1 6.1's plain words, two lines of the band (was one). CARD-2 (K3 g): two rules now, one
    // line of the band each (was oneLine("sabot", 2): one rule on two lines)
    for (const s of STARS) expect(faceAt("sabot", s)!.rules.map((r) => lines2(r.text)), `sabot ★${s}`).toEqual([1, 1]);
    expect(levels("sabot", 3)).toEqual(["{RATE} 5/11/[20]", "{BELT} 2/3/[4]"]); // Y7b2 (the words): was ["{RATE} 5/11/[20]", "{BELT} 2/3/[4]", "★3 SHRAPNEL"]
    expect(faceAt("sabot", 3)!.stats2).toEqual([["STUN", "4"]]);
  });
});

// ---------------------------------------------------------------------------------------------- row 12: HOT SWAP
describe("Y2 row 12: HOT SWAP's spark jump goes, its STUN and BURN numbers grow", () => {
  /** The slugs a HOT SWAP at ★`stars` has stamped onto the bench's belt after 4 s. */
  const stamped = (stars: number): Payload[] => {
    const bt = new Battle(factoryBench("hotswap", stars), barge(), 8);
    while (bt.t < 4) { bt.step(); bt.events.length = 0; }
    return [...bt.sides[0].routes[0].ammo.map((a) => a.p), ...bt.sides[0].turrets[0].stack];
  };

  it("sim: on, its ★2 spark slugs STUN 3 s and jump to no other part, its ember slugs carry 5 BURN (off: 2 s + a jump, 4)", () => {
    for (const [stars, stun, burn] of [[2, 3, 5], [3, 4, 9]] as const) {
      const ps = stamped(stars), spark = ps.find((p) => p.preset === "spark")!, ember = ps.find((p) => p.preset === "ember")!;
      expect([spark.shockTime, spark.jump, ember.burn], `★${stars}`).toEqual([stun, undefined, burn]);
    }
  });

  it("face: ALTERNATES BURN AND STUN SLUGS, no SPARK JUMP clause; ladders BURN 2/5/9, STUN 2/3/4", () => {
    expect(lines("hotswap")).toEqual(STARS.map(() => ["ALTERNATES {*BURN} AND {*STUN} SLUGS."]));
    oneLine("hotswap");
    expect(levels("hotswap", 1)).toEqual(["{RATE} [20]/23/27", "{BELT} [2]/3/4", "{BURN} [2]/5/9", "{STUN} [2]/3/4",
      `NEXT ★2: ${statRow([["RATE", "23"], ["BELT", "3"]])}, ${statRow([["BURN", "5"], ["STUN", "3"]])}`]);
  });
});

// ------------------------------------------------------------------------------------------ row 13: LIMPET WORKS
describe("Y2 row 13: LIMPET WORKS' DMG is its blast; its stall becomes blast damage", () => {
  it("data: on, the blast is the base's blast + its 20 on impact + 30 for each STUN second it gave (100/230/360), no stall", () => {
    for (const s of STARS) {
      const star = effectAt("limpet", s).factory!, sr = star.round as Extract<HarassRound, { kind: "limpet" }>;
      // Y7b2 (the flip: the base def is gone): was r.blast + AMMO.limpet.base + 30 * (r.stall ?? 0) and r.delay, read off
      // the switch-off def (0.9.2's blast 80/180/280 + 20 + 30 x stall 0/1/2; delay 3)
      expect(sr.blast, `★${s}`).toBe([100, 230, 360][s - 1]);
      expect([sr.stall, star.base, sr.delay]).toEqual([undefined, 0, 3]);
    }
  });

  it("sim: on, a ★2 charge stuck to a factory blasts the hull for 230 three seconds later and STUNs nothing (off: 180 and a 1 s STUN)", () => {
    const bt = quiet(), s = bt.sides[1], f = s.factories[0], hp = s.hull.hp;
    const round = effectAt("limpet", 2).factory!.round as HarassRound;
    probe(bt).roundImpact(s, target(s, "factory", f.uid), round, 0);
    while (bt.t < 3 + 2 * TICK) bt.step();
    expect([hp - s.hull.hp, f.disrupted > 0]).toEqual([230, false]);
  });

  it("sim: on, a charge's shot deals 0 of its own (no floor of 10: deck.ts shotFloor), what rigs added on top; off, its 20", () => {
    const shotDmg = (flat = 0): number => {
      const bt = new Battle(barge(), barge(), 8), tu = bt.sides[0].turrets[0], p = payload();
      p.ammo = "limpet";
      p.base = 0; // as its factory stamps it (content.ts limpet base 0)
      p.flat = flat;
      tu.stack.push(p);
      tu.phase = "fire";
      bt.step();
      return bt.projectiles[0].dmg;
    };
    expect([shotDmg(), shotDmg(20)]).toEqual([0, 20]);
    expect(shotFloor("limpet")).toBe(0);
    expect(shotFloor("plain")).toBe(10);
  });

  it("sim: on, its stamped charges carry no base damage (the blast holds it)", () => {
    const bt = new Battle(factoryBench("limpet", 1), barge(), 8);
    while (!bt.sides[0].routes[0].ammo.length) bt.step();
    const p = bt.sides[0].routes[0].ammo[0].p;
    expect([p.ammo, p.base]).toEqual(["limpet", 0]);
  });

  it("face: RATE 13, DMG 100, BELT 2; ITS SLUG BLAST THE HULL 3 SEC AFTER THEY HIT; ladder DMG 100/230/360", () => {
    // CARD-2 (REQ-BFG-081, K3 g; READ-3 6: THE HULL, THEY): the foe's hull, after a hit (was "... THE HULL 3{SEC} AFTER THEY HIT.")
    expect(lines("limpet")).toEqual(STARS.map(() => ["ITS {SLUG} BLAST THE FOE'S HULL 3{SEC} AFTER A HIT."]));
    oneLine("limpet");
    expect(faceAt("limpet", 1)!.stats).toEqual([["RATE", "13"], ["DMG", "100"], ["BELT", "2"]]);
    expect(levels("limpet", 2)).toEqual(["{DMG} 100/[230]/360", "{BELT} 2/[3]/4", `NEXT ★3: ${statRow([["DMG", "360"], ["BELT", "4"]])}`]);
  });
});

// ----------------------------------------------------------------------------------------------- row 14: MANTLET
describe("Y2 row 14: MANTLET guards its gun and its belts' last 1/2/3 tiles from ★1, not their rigs", () => {
  const lands = (stars: number, cell: number): boolean => {
    const bt = quiet(bench([], [["mantlet", stars]])), s = bt.sides[1];
    return probe(bt).disrupt(s, target(s, "belt", 0, cell), DISRUPT_TIME, "shock");
  };

  it("sim: on, ★1 guards the last tile into its gun (off: none at ★1), ★3 the last 3; the gun itself as before", () => {
    expect([lands(1, 5), lands(1, 4)]).toEqual([false, true]);
    expect([lands(2, 4), lands(2, 3)]).toEqual([false, true]);
    expect([lands(3, 3), lands(3, 2)]).toEqual([false, true]);
    const bt = quiet(bench([], [["mantlet", 1]])), s = bt.sides[1];
    expect(probe(bt).disrupt(s, target(s, "turret", 0), DISRUPT_TIME, "shock")).toBe(false);
  });

  it("sim: on, a rig working a guarded tile is STUNned (off: ★2 FULL GUARD's tile shares the immunity with its rigs)", () => {
    const rig = (): boolean => {
      const bt = quiet(bench([["whetstone", 4, 0, 1]], [["mantlet", 2]])), s = bt.sides[1], g = s.gates[0];
      g.online = true;
      return probe(bt).disrupt(s, target(s, "gate", g.uid), DISRUPT_TIME, "shock");
    };
    expect(rig()).toBe(true);
  });

  it("face: STUN CAN'T STOP ITS GUN OR LAST 1 TILE (2, 3 TILES), no clause; ladder LAST 1/2/3 TILES", () => {
    expect(lines("mantlet")).toEqual([["{*STUN} CAN'T STOP ITS GUN OR LAST 1 TILE."], ["{*STUN} CAN'T STOP ITS GUN OR LAST 2 TILES."],
      ["{*STUN} CAN'T STOP ITS GUN OR LAST 3 TILES."]]);
    oneLine("mantlet");
    // (the ⓘ view's NEXT★ line names the perk the next star brings, in brass after its numbers: R-1 keeps names there)
    expect(levels("mantlet", 1)).toEqual(["LAST [1]/2/3 TILES", "★2 FULL GUARD", "★3 BULWARK SKIRT", "NEXT ★2: LAST 2 TILES ★2 FULL GUARD"]);
  });
});

// --------------------------------------------------------------------------------------------- row 15: LODESTONE
describe("Y2 row 15: LODESTONE pays for each STUN on the foe, tiles too, wrecks not, no floor or cap", () => {
  /** The flat a slug carries past side 0's LODESTONE (★1, tile 2 of the bench's belt) while side 1 holds STUNs on belt
   *  tiles `tiles` and its factory, and (`wreck`) its WHETSTONE wrecked; read off a slug that passed it after it came online. */
  const flat = (tiles: number[], wreck: boolean): number => {
    const bt = new Battle(bench([["lodestone", 4, 3, 1]]), bench([["whetstone", 4, 3, 1]]), 8), foe = bt.sides[1];
    for (const ci of tiles) foe.routes[0].cellDisrupt[ci] = 50;
    foe.factories[0].disrupted = 50;
    foe.gates[0].wrecked = wreck;
    while (bt.t < 8) {
      bt.step();
      bt.events.length = 0;
      const a = bt.t > 2.5 ? bt.sides[0].routes[0].ammo.find((x) => x.processed >= 2) : undefined;
      if (a) return a.p.flat;
    }
    throw new Error("no slug passed the LODESTONE");
  };

  it("sim: on, 3 stunned tiles and a stunned factory pay 40 and the wrecked rig nothing (off: floor 10 + 10 x 2, the wreck counted)", () => {
    expect(flat([1, 2, 3], true)).toBe(40);
  });

  it("sim: on, 7 STUNs pay 70, past the base's MAX 60; none pays 0 (off: the floor's 10)", () => {
    expect(flat([0, 1, 2, 3, 4, 5], false)).toBe(70);
    expect((() => {
      const bt = new Battle(bench([["lodestone", 4, 3, 1]]), bench(), 8);
      while (bt.t < 8) {
        bt.step();
        bt.events.length = 0;
        const a = bt.t > 2.5 ? bt.sides[0].routes[0].ammo.find((x) => x.processed >= 2) : undefined;
        if (a) return a.p.flat;
      }
      return -1;
    })()).toBe(0);
  });

  it("face (new with the switch on): HIT: +10 DMG FOR EACH STUN ON THE FOE; ladder DMG +10/+22/+35 EACH", () => {
    expect(hasFace("lodestone")).toBe(true);
    expect(lines("lodestone")).toEqual(["+10", "+22", "+35"].map((d) => [`HIT: ${d} {DMG} FOR EACH {*STUN} ON THE FOE.`]));
    expect(faceAt("lodestone", 1)!.rules[0].label).toBe("HIT:");
    oneLine("lodestone");
    expect(levels("lodestone", 1)).toEqual(["{DMG} [+10]/+22/+35 EACH", `NEXT ★2: ${icons("{DMG} +22 EACH", "alone")}`]);
  });
});

// ------------------------------------------------------------------------------------------- row 16: BRACE FRAME
describe("Y2 row 16: BRACE FRAME cuts enemy STUNs on its tiles 50%/70%/85%, plated or not, and not on itself", () => {
  /** The STUN a 4 s shock leaves on the frame's tile (or `self`, on the frame), with the hull plated or not. */
  const left = (plated: boolean, self: boolean, stars = 1): number => {
    const bt = quiet(bench([["braceframe", 4, 3, stars]])), s = bt.sides[1], g = s.gates[0], h = g.hits[0];
    g.online = true;
    if (plated) s.plate.plate = 50;
    probe(bt).disrupt(s, self ? target(s, "gate", g.uid) : target(s, "belt", h.route, h.tile), 4, "shock");
    return self ? g.disrupted : s.routes[h.route].cellDisrupt[h.tile];
  };

  it("sim: on, a plated hull's braced tile keeps 2 s of 4 (off: 1 s, 75% shorter); ★3 0.6 s", () => {
    expect(left(true, false)).toBeCloseTo(2, 9);
    expect(left(false, false, 3)).toBeCloseTo(0.6, 9);
  });

  it("sim: on, a STUN on the frame itself is not cut (off: 50% shorter)", () => {
    expect(Math.round(left(false, true) * 60)).toBe(240);
  });

  it("face (new with the switch on): ENEMY STUN ON ITS TILES: 50% SHORTER; ladder 50%/70%/85% SHORTER", () => {
    expect(hasFace("braceframe")).toBe(true);
    expect(lines("braceframe")).toEqual(["50%", "70%", "85%"].map((p) => [`ENEMY {*STUN} ON ITS TILES: ${p} SHORTER.`]));
    oneLine("braceframe");
    expect(levels("braceframe", 1)).toEqual(["[50%]/70%/85% SHORTER", "NEXT ★2: 70% SHORTER"]);
    expect(levels("braceframe", 3)).toEqual(["50%/70%/[85%] SHORTER"]);
  });
});

// ----------------------------------------------------------------------------------------------- row 17: SPOTTER
describe("Y2 row 17: SPOTTER re-aims 1/2/3 times, no factory weighting, no sure part", () => {
  it("sim: on, a ★3 SPOTTER's turret re-aims 3 times with no weighting (off: 2, factories x3, never bare hull)", () => {
    const b = bench([], [["spotter", 3]]);
    const g = gearStats(b, 0);
    expect([g.rerolls, g.factoryWeight, g.alwaysMachine]).toEqual([3, 1, false]);
  });

  it("sim: on, 2,000 ★3 picks land on bare hull about 1 in 16 (0.5^4) and on parts by their weight; off, never on bare hull", () => {
    const picks = (): Record<string, number> => {
      const bt = new Battle(bench([], [["spotter", 3]]), bench([["whetstone", 4, 3, 1]]), 5), tu = bt.sides[0].turrets[0];
      const n: Record<string, number> = {};
      for (let i = 0; i < 2000; i++) { const k = probe(bt).pickTarget(bt.sides[1], false, tu).kind; n[k] = (n[k] ?? 0) + 1; }
      return n;
    };
    const a = picks();
    expect((a.hull ?? 0) / 2000).toBeGreaterThan(0.04);
    expect((a.hull ?? 0) / 2000).toBeLessThan(0.09);
  });

  it("face: SHOTS AT BARE HULL GET 1/2/3 MORE AIM(S), no clause; ladder 1/2/3 MORE AIMS", () => {
    // WORDS-1 (REQ-BFG-081; READ-1 6.1's one-offs: BARE HULL): AIMED AT NO PART (was "SHOTS AT BARE HULL GET ...")
    // CARD-2 (REQ-BFG-081, K3 g; READ-2 7.1: AIM AGAIN): was "... GET 1 MORE AIM." / "2 MORE AIMS." / "3 MORE AIMS." (the
    // ladder keeps its words)
    expect(lines("spotter")).toEqual([["SHOTS AIMED AT NO PART AIM AGAIN ONCE."], ["SHOTS AIMED AT NO PART AIM AGAIN TWICE."], ["SHOTS AIMED AT NO PART AIM AGAIN 3 TIMES."]]);
    oneLine("spotter");
    // Y7b2 (the words): was ["[1]/2/3 MORE AIMS", "★2 FACTORY SPOT", "★3 EAGLE EYE", "NEXT ★2: 2 MORE AIMS ★2 FACTORY SPOT"]
    expect(levels("spotter", 1)).toEqual(["[1]/2/3 MORE AIMS", "NEXT ★2: 2 MORE AIMS"]);
  });
});

// --------------------------------------------------------------------------------------------- row 18: OVERDRIVE
describe("Y2 row 18: OVERDRIVE ★2/★3 lose their flat and their guards", () => {
  it("sim: on, a slug past a ★3 OVERDRIVE gains no damage (off: +30)", () => {
    const flat = (): number => {
      const bt = new Battle(bench([["overdrive", 4, 3, 3]]), barge(), 8);
      while (bt.t < 8) {
        bt.step();
        bt.events.length = 0;
        const a = bt.t > 2.5 ? bt.sides[0].routes[0].ammo.find((x) => x.processed >= 2) : undefined;
        if (a) return a.p.flat;
      }
      throw new Error("no slug passed the OVERDRIVE");
    };
    expect(flat()).toBe(0);
  });

  it("sim: on, enemy CHAIN and FROST rounds STUN the tiles after a ★3 OVERDRIVE (off: AFTERBURNER keeps both off)", () => {
    const bt = quiet(bench([["overdrive", 4, 3, 3]])), s = bt.sides[1];
    s.gates[0].online = true;
    const drag = probe(bt).disrupt(s, target(s, "belt", 0, 3), 1, "drag"), frost = probe(bt).disrupt(s, target(s, "belt", 0, 4), 2, "freeze");
    expect([drag, frost]).toEqual([true, true]);
  });

  it("face: ITS BELTS RUN 3/4/5 TIMES AS FAST, one line (no HIT: +10 line, no guard clause); ladder 3/4/5 TIMES", () => {
    // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D: read as the whole belt): FROM THESE TILES ON, two lines of the op band
    expect(lines("overdrive")).toEqual([3, 4, 5].map((n) => [`ITS BELTS RUN ${n} TIMES AS FAST FROM THESE TILES ON.`]));
    oneLine("overdrive", 2); // WORDS-1 (REQ-BFG-081): READ-1 6.1's plain words, two lines of the band (was one)
    expect(levels("overdrive", 1)).toEqual(["[3]/4/5 TIMES", "★2 REDLINE", "★3 AFTERBURNER", "NEXT ★2: 4 TIMES ★2 REDLINE"]);
  });
});

// ---------------------------------------------------------------------------------------- row 19: GRAPNEL GUN ★3
describe("Y2 row 19: GRAPNEL GUN ★3 drops SALVAGE, and a hit keg is no longer disarmed", () => {
  /** Side 0 fits a GRAPNEL GUN at ★`stars`; its shot (rip 3, reach 3) lands on side 1's belt tile 2, where 2 slugs ride;
   *  `gate`: a rig of side 1 to aim at instead. Returns the battle after the impact. */
  function ripShot(stars: number, gates: [string, number, number, number][] = [], at?: "gate"): Battle {
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
  }

  it("sim: on, a ★3 shot that rips 2 slugs banks no salvage (off: its next shot's +10 for each, x the class)", () => {
    const a = ripShot(3);
    expect(a.sides[1].routes[0].ammo).toHaveLength(0);
    // Y7b2 (the flip): TurretState.salvage is gone (GRAPNEL's SALVAGE LINE, switch-off only), so it is read loosely: none
    expect((a.sides[0].turrets[0] as { salvage?: number }).salvage ?? 0).toBe(0);
  });

  it("sim: on, a shot at a POWDER KEG rips the slugs by its tile and leaves it armed (off: it disarms it)", () => {
    const a = ripShot(1, [["keg", 4, 3, 1]], "gate");
    expect(a.sides[1].gates[0].consumed).toBe(false);
    expect(a.events.filter((e) => e.type === "rip")).toHaveLength(1);
  });

  it("face: RIPS 1/2/3 SLUG(S), no SALVAGE LINE clause at ★3; ladder RIPS 1/2/3; the tap drops the keg", () => {
    // TXT-096 (REVIEW-TXT095 Q2): a hit on a rig rips too (tests/txt096.faces.test.ts pins it to battle.ts rip); was
    // "SHOT: RIPS 1 SLUG OFF AN ENEMY BELT." (2, 3 SLUGS)
    expect(lines("grapnel")).toEqual([["SHOT: ON A BELT OR RIG, RIPS 1 SLUG."], ["SHOT: ON A BELT OR RIG, RIPS 2 SLUGS."], ["SHOT: ON A BELT OR RIG, RIPS 3 SLUGS."]]);
    oneLine("grapnel");
    expect(levels("grapnel", 1)).toEqual(["RIPS [1]/2/3", "NEXT ★2: RIPS 2"]); // Y7b2 (the words): was ["RIPS [1]/2/3", "★3 SALVAGE LINE", "NEXT ★2: RIPS 2"]
    expect(glossaryText("SHOT", { def: "grapnel", stars: 1 })).toBe("SHOT: IT RIPS THE NEAREST SLUGS WITHIN 1 TILE OF A HIT.");
  });
});
