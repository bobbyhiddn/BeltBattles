// Y7b1 TUNE-Y (release Y; REQ-BFG-070, REQ-BFG-046; cap's rulings Y7A-R1..R6, REVIEW-Y7A section 7): the rulings built
// behind the star switch (content.ts STAR_RULES, withStarRules), each read with the switch on against the same scene off.
// With the switch off nothing here moves: every off reading is the base's (base092).
// - Y7A-R1, STOKER: its cap holds with the switch on, at every star (battle.ts stokedPace, deckRating.ts rateDeck), as at
//   0.9.2: no overfeed trap. The stoke stays 0.2 / 0.44 / 0.7; its face says the cap (UP TO), its ⓘ sentence names the gun.
// - Y7A-R3c / R3d, ANVIL BREECH and IRON WALL: their STAR_DIFF rows are deleted, so with the switch on each reads its base
//   def (the same object as off): the sim, the rating, the ⓘ sentences and the timeline as off; each face states both parts
//   on one line.
// - Y7A-R4 / R5, the numbers on: DRAKE NOZZLE flatPerBurn 38 / 27 / 19, COUNTERWEIGHT perTile.each 2 / 5 / 7, VENOM DRIP
//   burnPlus 2 / 3 / 5 s (guarded). The bench's guards (BRIEF-Y7B1 B1): VENOM's uptake on read 9.0% (< 12.0%), so it is back
//   at Y6's 3 / 6 / 9 s; COUNTERWEIGHT read x0.28 of the rare median (< 0.5x), so its fallback 3 / 7 / 11; DRAKE drew no par
//   deck (uptake 0 of 480, no lift to read, no reading in 0.5-1.5x), so its fallback 25 / 18 / 13.
// - Y7A-R2, EXT. CHAMBER (text only): the rule stays (perShot 2 / 3 / 4, a shot fires at most what the chamber holds); with
//   the switch on its face is true for every gun and star: ★1 FIRES 2 (exact), ★2/★3 UP TO 3 / UP TO 4; its ⓘ says why.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { ITEMS } from "../src/sim/content";
import { type Build, type TimelineHit } from "../src/sim/deck";
import { rateDeck } from "../src/sim/deckRating";
import { effectAt, starField } from "../src/sim/stars";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { abilityText, cardText, gist, hitText } from "../src/ui/abilityText";
import { faceAt } from "../src/ui/faces";
import { glossaryText } from "../src/ui/glossary";
import { STARS, levels, lines, next, oneLine } from "./y3.helpers";
import { K, barge, furnaceBench, item, withItem, withMod } from "./wave3.helpers";
import { withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): the off checks beside its re-pins

const SEEDS = [1, 2, 3, 4, 5]; // wave3.decks' capRows: both sides +3000 hull, 120 s

// ------------------------------------------------------------------------- Y7A-R1: STOKER's cap holds with the switch on
describe("Y7b1 Y7A-R1: STOKER's cap holds with the switch on, at every star (no overfeed trap)", () => {
  const furnaceStart = () => heroStartBuild("furnace", 1), weaverStart = () => heroStartBuild("weaver", 101);
  /** wave3.decks' lockjaw: a KILN and a TWIN MOULD sharing one gun (tests/wave3.decks.test.ts, line for line). */
  const lockjaw = (): Build => ({
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 2, y: 6 }, { uid: 2, def: "twinmould", x: 6, y: 6 }],
    routes: [
      { factory: 1, cells: [K(2, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] },
      { factory: 2, cells: [K(7, 5), K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
    ], mods: [], beltCap: 30, hullBonus: 0,
  } as Build);
  const sturdy = (b: Build): Build => ({ ...b, hullBonus: b.hullBonus + 3000 });
  /** wave3.decks' capRows: mean damage dealt and jams over the seeds, no stoker, then a STOKER at (x, y) at 1-3 stars. */
  const capRows = (base: () => Build, x: number, y: number) => [0, 1, 2, 3].map((s) => {
    let dmg = 0, jams = 0;
    for (const seed of SEEDS) {
      const b = s ? withItem(base(), item(70, "stoker", x, y, 0, s)) : base();
      const bt = new Battle(sturdy(b), sturdy(weaverStart()), seed);
      while (!bt.over && bt.ticks < 60 * 200) { bt.step(); bt.events.length = 0; }
      dmg += bt.sides[0].stats.damage;
      jams += bt.sides[0].stats.jams;
    }
    return { dmg: dmg / SEEDS.length, jams: jams / SEEDS.length };
  });

  it("battle: on FURNACE's start deck none <= ★1 <= ★2 <= ★3 with 0 jams, the off rows 3034 / 3626 / 3700 / 3700 (Y7a, before: ★2/★3 2738 / 2664 with 14-15 jams)", () => {
    const rows = capRows(furnaceStart, 6, 6);
    for (const s of STARS) expect(rows[s].dmg, `★${s} >= ★${s - 1}`).toBeGreaterThanOrEqual(rows[s - 1].dmg);
    expect(rows.map((r) => r.jams)).toEqual([0, 0, 0, 0]);
    expect(rows.map((r) => Math.round(r.dmg))).toEqual([3034, 3626, 3700, 3700]);
  }, 120_000);

  it("battle: on, both shared-gun rows read as off: a STOKER on the KILN or on the mould deals 3955 at every star, no more jams than none (Y7a, before: under none at every star)", () => {
    for (const [x, y] of [[1, 6], [8, 6]] as const) {
      const rows = capRows(lockjaw, x, y);
      expect(rows.map((r) => Math.round(r.dmg)), `STOKER at (${x},${y})`).toEqual([3955, 3955, 3955, 3955]);
      for (const s of STARS) expect(rows[s].jams, `(${x},${y}) ★${s}`).toBeLessThanOrEqual(rows[0].jams);
    }
  }, 240_000);

  it("rating: on, FURNACE's start deck rates none / ★1 / ★2 / ★3 at 46.6 / 50.4 / 51.1 / 51.1, as off (Y7a, before: 45.6 / 40.8 at ★2/★3); stokeKeep as off", () => {
    const stoked = (s: number) => (s ? withItem(furnaceStart(), item(70, "stoker", 6, 6, 0, s)) : furnaceStart());
    const offense = (s: number) => rateDeck(stoked(s)).offense;
    // AZ-BUMP (the flip, LADDER_FIX): none / ★1 46.6 / 50.4 -> 46.7 / 50.5, P13: the walk rides tick by tick (the rating
    // reads the walk's damage and time; the KILN's slugs heat as they ride), no STOKER number; ★2 / ★3 stay 51.1, held at the
    // gun (★3's 0.85 too). With LADDER_FIX off the title's numbers, as before
    expect([0, 1, 2, 3].map((s) => offense(s).toFixed(1))).toEqual(["46.7", "50.5", "51.1", "51.1"]);
    expect(withLadderFix(() => [0, 1, 2, 3].map((s) => offense(s).toFixed(1)), false)).toEqual(["46.6", "50.4", "51.1", "51.1"]);
  });

  it("data and texts: the stoke stays 0.2 / 0.44 / 0.7; on, the face says the cap in its one line (UP TO) and the ⓘ sentence names the gun, as off", () => {
    // AZ-BUMP (the flip, LADDER_FIX): ★3 0.7 -> 0.85 and its face 70% -> 85%, the star-ladder pass (ladderFix.ts LADDER_DEFS
    // stoker); with LADDER_FIX off the title's 0.2 / 0.44 / 0.7, as before
    expect(STARS.map((s) => effectAt("stoker", s).gate!.stoke)).toEqual([0.2, 0.44, 0.85]);
    expect(lines("stoker")).toEqual(["20%", "44%", "85%"].map((p) => [`ITS FACTORIES WORK UP TO ${p} FASTER.`]));
    expect(withLadderFix(() => [STARS.map((s) => effectAt("stoker", s).gate!.stoke), lines("stoker")], false))
      .toEqual([[0.2, 0.44, 0.7], ["20%", "44%", "70%"].map((p) => [`ITS FACTORIES WORK UP TO ${p} FASTER.`])]);
    oneLine("stoker");
    expect(faceAt("stoker", 2)!.caveats).toBeUndefined();
    expect(abilityText("stoker", 1).sentences[1]).toBe("IT NEVER MAKES A FACTORY OUTRUN ITS GUN.");
  });
});

// ------------------------------------------------------------- Y7A-R3c / R3d: ANVIL BREECH and IRON WALL read their base defs
describe("Y7b1 Y7A-R3c / R3d: ANVIL BREECH and IRON WALL read their base defs with the switch on", () => {
  it("data: on, each def is the base's own object (no STAR_DIFF row), its numbers 0.9.2's at every star", () => {
    for (const s of STARS) {
      expect(effectAt("anvil", s).core, `anvil ★${s}`).toEqual({ routine: "anvil", anvilFlat: [25, 55, 88][s - 1], perPlate: [1, 2.2, 3.5][s - 1] });
      expect(effectAt("shieldwall", s).gate, `shieldwall ★${s}`).toEqual({ plate: [10, 22, 35][s - 1], plated: { min: 120, flat: [30, 66, 105][s - 1] } });
    }
  });

  it("faces: on, each states both parts on one line inside the band; ANVIL's is 0.9.2's own face; ladders per part", () => {
    expect(lines("anvil")).toEqual([[25, 100], [55, 220], [88, 350]].map(([d, p]) => [`SHOT: +${d} {DMG}, +${p}% OF YOUR {*PLATE}.`]));
    expect(lines("shieldwall")).toEqual([[10, 30], [22, 66], [35, 105]].map(([p, d]) => [`HIT: +${p} {*PLATE}, +${d} {DMG} AT 120+ {*PLATE}.`]));
    oneLine("anvil");
    oneLine("shieldwall");
    expect(levels("anvil", 1)).toEqual(["{DMG} [+25]/+55/+88", "[+100%]/+220%/+350% OF {PLATE}", next(2, "+55 {DMG}, +220% OF {PLATE}")]);
    expect(levels("shieldwall", 3)).toEqual(["{PLATE} +10/+22/[+35]", "{DMG} +30/+66/[+105]"]);
  });
});

// ------------------------------------------------------------------- Y7A-R4 / R5: the new numbers, with the switch on
describe("Y7b1 Y7A-R4 / R5: DRAKE NOZZLE, COUNTERWEIGHT and VENOM DRIP read their new numbers with the switch on", () => {
  // the guard (BRIEF-Y7B1 B1): at 38 / 27 / 19 no par deck took it (uptake on 0 of 480 deck-days), so no lift per gold could be
  // read in 0.5-1.5x of the rare median: the ruling's fallback 25 / 18 / 13 (no third point)
  it("DRAKE NOZZLE (Y7A-R4, its fallback): flatPerBurn 25 / 18 / 13 on (Y4's 10 / 7 / 5); its face and ⓘ ladder say them; off, 0.9.2's 20 / 15 / 10", () => {
    expect(STARS.map((s) => effectAt("drake", s).core!.flatPerBurn)).toEqual([25, 18, 13]);
    expect(lines("drake")).toEqual([25, 18, 13].map((d) => [`SHOT: EACH ${d} BONUS DAMAGE IS 1 {*BURN}.`]));
    expect(levels("drake", 2)).toEqual(["EACH 25/[18]/13", next(3, "EACH 13")]);
    expect(gist("drake", 3, { k: 1 })).toBe("1 BURN FOR EVERY 13 DAMAGE");
  });
  // the guard (BRIEF-Y7B1 B1): at 2 / 5 / 7 its lift on read +1.7 [-5.7, +9.2] n 3 at 4.0 G (0.43/G, x0.28 of the rare median
  // 1.58), under 0.5x, so the ruling's fallback 3 / 7 / 11
  it("COUNTERWEIGHT (Y7A-R5, its fallback): perTile.each 3 / 7 / 11 on, no cap (Y5's 5 / 11 / 18); its face and ⓘ ladder say them; off, 0.9.2's 5 / 11 / 18 up to 60 / 130 / 210", () => {
    expect(STARS.map((s) => effectAt("counterweight", s).gate!.perTile)).toEqual([3, 7, 11].map((each) => ({ each })));
    expect(lines("counterweight")).toEqual([3, 7, 11].map((d) => [`HIT: +${d} {DMG} FOR EACH TILE RIDDEN.`]));
    expect(levels("counterweight", 2)).toEqual(["+3/[+7]/+11 {DMG} EACH", next(3, "+11 {DMG} EACH")]);
    expect(gist("counterweight", 1)).toBe("3 DAMAGE FOR EACH TILE");
  });
  // the guard (BRIEF-Y7B1 B1): at 2 / 3 / 5 s VENOM's uptake on read 9.0% (43 of 480 deck-days), under 12.0% (a third of
  // Y7a's off 36.0%), so it is back at Y6's 3 / 6 / 9 s (the 2 / 3 / 5 commit's re-pins reverted with it)
  it("VENOM DRIP (Y7A-R5, its uptake guard): burnPlus back at 3 / 6 / 9 s on; its face, ⓘ ladder, sentences and timeline say them; off, 0.9.2's poison 2 / 4 / 7", () => {
    expect(STARS.map((s) => effectAt("venom", s).gate)).toEqual([3, 6, 9].map((burnPlus) => ({ burnPlus })));
    expect(lines("venom")).toEqual([3, 6, 9].map((n) => [`HIT: ITS {*BURN} LASTS +${n}{SEC}.`]));
    expect(levels("venom", 1)).toEqual(["[+3]/+6/+9{SEC}", next(2, "+6{SEC}")]);
    expect(abilityText("venom", 3).sentences[0]).toBe("EACH BURN ON THE PAYLOADS IT HITS LASTS 9 SECONDS LONGER.");
    expect(hitText({ def: "venom", stars: 2 } as TimelineHit, "free")).toBe("VENOM DRIP +6 SEC TO EACH BURN"); // Y7b2 (the words): was "VENOM DRIP: ITS BURN LASTS +6 SEC"
  });
});

// ------------------------------------------------------------- Y7A-R2: EXT. CHAMBER's face is true for every gun and star
describe("Y7b1 Y7A-R2: EXT. CHAMBER's switch-on face is true for every gun and star (text only)", () => {
  const GUNS = Object.values(ITEMS).filter((d) => d.kind === "turret" && d.turret).map((d) => d.id);
  /** The face's n at `stars` (the number after FIRES / UP TO) and whether it says UP TO. */
  const face = (stars: number) => { const t = faceAt("chamber", stars)!.rules[0].text; return { t, n: Number(/FIRES (?:UP TO )?(\d+)/.exec(t)![1]), upTo: / UP TO /.test(t) }; };
  /** The most loads one shot of gun `gun` (its own chamber, at ★`gs`) fires with a ★`cs` EXT. CHAMBER, as the battle builds the
   *  turret (makeTurret: perShot, window) and fires it (Battle.chambers: rt.count = perShot loads, each from the chamber's stack). */
  const most = (gun: string, gs: number, cs: number) => {
    const b = withMod({ ...furnaceBench(), turrets: [{ slot: 0, def: gun, uid: 900, ...starField(gs) }] }, 60, "chamber", 0, cs);
    const tu = new Battle(b, barge(), 8).sides[0].turrets[0];
    expect(tu.window, `${gun} ★${gs}: its own chamber`).toBe(effectAt(gun, gs).turret!.window);
    return Math.min(tu.perShot, tu.window);
  };

  it("the rule is unchanged: on, perShot 2 / 3 / 4 and no slot (Y4's data)", () => {
    expect(STARS.map((s) => effectAt("chamber", s).mod)).toEqual([2, 3, 4].map((perShot) => ({ perShot })));
  });

  it("every gun at every star: the shot's real count <= the face's n; ★1's 2 is exact on every gun; UP TO exactly where some gun fires fewer", () => {
    expect(GUNS.length).toBeGreaterThanOrEqual(13);
    for (const cs of STARS) {
      const f = face(cs);
      const counts = GUNS.flatMap((g) => STARS.map((gs) => most(g, gs, cs)));
      expect(Math.max(...counts), `★${cs}: ${f.t}`).toBeLessThanOrEqual(f.n);
      expect(f.upTo, `★${cs}: UP TO iff some gun fires fewer than ${f.n}`).toBe(Math.min(...counts) < f.n);
      if (cs === 1) expect(counts.every((c) => c === 2), "★1: FIRES 2 on every gun").toBe(true);
    }
    expect([1, 2, 3].map((s) => face(s).t)).toEqual(["EACH SHOT FIRES 2 {SLUG}.", "EACH SHOT FIRES UP TO 3 {SLUG}.", "EACH SHOT FIRES UP TO 4 {SLUG}."]);
    // a 4-load gun fires the face's 4 at ★3 (BOMBARD), a 2-load gun 2 (DART): UP TO is the shortest true wording
    expect([most("bombard", 1, 3), most("dartgun", 1, 3)]).toEqual([4, 2]);
  });

  it("its ⓘ: the tap on UP TO says a shot never fires more than its gun's chamber holds; the kept sentences, gist and card say UP TO; off, every text as before", () => {
    expect(glossaryText("UP TO", { def: "chamber", stars: 2 })).toBe("UP TO: A SHOT NEVER FIRES MORE THAN ITS GUN'S CHAMBER HOLDS.");
    expect(abilityText("chamber", 2).sentences).toEqual(["THE TURRET FIRES UP TO 3 LOADS EACH SHOT.", "A SHOT NEVER FIRES MORE THAN ITS GUN'S CHAMBER HOLDS."]);
    expect([gist("chamber", 1), gist("chamber", 3), cardText("chamber")]).toEqual(["FIRES 2 LOADS A SHOT", "FIRES UP TO 4 LOADS A SHOT", "FIRES 2 LOADS A SHOT."]);
  });
});
