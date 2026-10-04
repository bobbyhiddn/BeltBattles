// 0.8.0 B1 M1 (REQ-BFG-026, ref/BRIEF-v080-B1.md section 2): the harness first, H1's two items.
// 1. The par player keeps FOUNDRY's belts in sync (src/sim/harness/player.ts syncKeeper): no change it makes loses a gun
//    its CRUCIBLE belts reach in sync (syncEstimate.ts syncedTurrets, the route inspector's SYNC mark), and every deck
//    without a synced gun (every other hero's) is judged by nothing new.
// 2. The race reference decks keep their mirrored rigs (src/sim/races/refBuilds.ts STEPS): two 1-star copies merge
//    (0.6.1a), so each mirror is another part on its own belt; every rig works a belt; no CALIBRATION on a gun that
//    waits for its loads (FOUNDRY's, SIPHON's: VERIFIED-I1 call 2).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BREAKER_SHARE, FIGHT_T, MEAN_PLATE, MEAN_PLATE_OTHER, PLATED_SHARE, RATING_CURVE, meanPlate, rateDeck } from "../src/sim/deckRating";
import { ITEMS } from "../src/sim/content";
import { cloneBuild, itemByUid, key as K, platedDeck, rigHits, walkRoute, type Build } from "../src/sim/deck";
import { playerRun, PLAYER_DAYS, syncKeeper } from "../src/sim/harness/player";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { raceRefBuild } from "../src/sim/races/refBuilds";
import { syncedTurrets } from "../src/sim/syncEstimate";
import { starsOf } from "../src/sim/stars";

/** The belt tiles each route's rigs work: route index -> rig defs (one per hit). */
function worked(b: Build): string[][] {
  return rigHits(b).map((r) => r.flatMap((t) => t.map((h) => h.def)));
}

describe("B1 M1: the par player keeps FOUNDRY's belts in sync", () => {
  it("syncKeeper judges only decks with a synced gun: a speed rig on one belt of the pair loses it, one on another belt does not", () => {
    for (const h of ["furnace", "weaver", "bastion"] as const) expect(syncKeeper(heroStartBuild(h, 1)), h).toBeUndefined();
    const start = heroStartBuild("foundry", 1);
    expect(syncedTurrets(start)).toEqual([0]);
    const keep = syncKeeper(start)!;
    expect(keep).toBeTypeOf("function");
    // GREASE WORKS (a speed rig) beside the CRUCIBLE's left belt at (1,3), arrow east onto (2,3): that belt's blanks
    // reach gun 1 sooner, out of the sync window
    const greased = cloneBuild(start);
    greased.items.push({ uid: 9001, def: "grease", x: 1, y: 3, rot: 1 });
    expect(worked(greased).flat()).toContain("grease");
    expect(keep(greased)).toBe(false);
    // a WHETSTONE (no speed) on the same tile keeps the pair in sync
    const whet = cloneBuild(start);
    whet.items.push({ uid: 9001, def: "whetstone", x: 1, y: 3, rot: 1 });
    expect(keep(whet)).toBe(true);
    // the same deck with nothing changed keeps it, of course
    expect(keep(cloneBuild(start))).toBe(true);
  });

  it("the par FOUNDRY keeps a synced gun on every day of every run (seeds 1-12); its pair stays fed by the CRUCIBLE", () => {
    let decks = 0;
    for (let s = 1; s <= 12; s++) {
      const run = playerRun("foundry", PLAYER_DAYS, s);
      for (const d of run) {
        decks++;
        expect(syncedTurrets(d.build), `seed ${s} day ${d.day}`).toContain(0);
        const crucible = d.build.items.find((p) => p.def === "crucible")!;
        expect(d.build.routes.filter((r) => r.factory === crucible.uid).length, `seed ${s} day ${d.day}`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(decks).toBe(120);
  });

  it("FOUNDRY's par players still buy speed rigs, and place every one where it keeps the pair in sync", () => {
    let speed = 0;
    for (let s = 1; s <= 12; s++) {
      const b = playerRun("foundry", PLAYER_DAYS, s)[PLAYER_DAYS - 1].build;
      const crucible = b.items.find((p) => p.def === "crucible")!.uid;
      rigHits(b).forEach((r, ri) => r.forEach((t) => t.forEach((h) => {
        const g = ITEMS[h.def].gate;
        if (!g?.speed) return;
        speed++;
        // a speed rig on a CRUCIBLE belt would desync it: the guard puts them on other belts (or both belts alike)
        if (b.routes[ri].factory === crucible) expect(syncedTurrets(b), `seed ${s}: ${h.def} on a CRUCIBLE belt`).toContain(0);
      })));
    }
    expect(speed).toBeGreaterThan(0);
  });
});

describe("B1 M2: the par player's rating reads plating as battles hold it (deckRating.ts; oracle fda49d0c97fac446)", () => {
  // the measurement the constants come from: each hero's plating par decks against the FURNACE par field, days 3-9,
  // the hull's plating at each of the side's own shots (output-B1/kit/probes/platemean.test.ts); THANE KARSK's PLATE
  // BREAKER blows that took a plating (N1)
  const M = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/b1-platemean.json", import.meta.url)), "utf8")) as {
    heroes: Record<string, { shots: number; mean: number; share: number }>; breaker: { blowsTakingPlating: [number, number] };
  };

  // NUM-1 (REQ-BFG-047; cap's oracle bcc36c430b4f3a01): the fixture's means are in pre-NUM-1 plating units, the file
  // unchanged: this test reads them x10 (its own inline conversion) and scales the tolerance with them (0.3 -> 3)
  it("MEAN_PLATE is each hero's own measured plating at a shot (within 3, NUM-1 units; was 0.3); P1's half-the-cap 120 is gone", () => {
    for (const h of ["bastion", "furnace", "weaver", "foundry"] as const) {
      expect(M.heroes[h].shots, h).toBeGreaterThan(1000);
      const measured = M.heroes[h].mean * 10;
      expect(Math.abs(meanPlate(h) - measured), `${h}: ${meanPlate(h)} vs measured ${measured}`).toBeLessThanOrEqual(3);
      expect(MEAN_PLATE[h], h).toBe(meanPlate(h));
    }
    expect(meanPlate("metronome")).toBe(MEAN_PLATE_OTHER);
    expect(MEAN_PLATE_OTHER).toBe(meanPlate("furnace"));
  });

  it("PLATED_SHARE is every hero's measured share of shots fired while plated (within 0.1); BREAKER_SHARE is N1's 39-51%", () => {
    for (const h of ["bastion", "furnace", "weaver", "foundry"] as const) {
      expect(Math.abs(PLATED_SHARE - M.heroes[h].share), `${h}: measured ${M.heroes[h].share}`).toBeLessThanOrEqual(0.1);
    }
    const [lo, hi] = M.breaker.blowsTakingPlating;
    expect(BREAKER_SHARE).toBeGreaterThanOrEqual(lo);
    expect(BREAKER_SHARE).toBeLessThanOrEqual(hi);
  });

  it("the rating prices a PLATE BREAKER on a plated deck between its floor and its big number, at BREAKER_SHARE", () => {
    // BASTION's start deck (it plates) with a PLATE BREAKER beside its bulwark belt, against the same deck whose breaker
    // walk is forced to the floor and to the big number by a deck that never plates (FURNACE's), as the walk's two passes
    const withBreaker = (b: Build): Build => {
      const d = cloneBuild(b);
      d.items.push({ uid: 9101, def: "platebreaker", x: 3, y: 2 });
      return d;
    };
    const bas = withBreaker(heroStartBuild("bastion", 1));
    expect(platedDeck(bas)).toBe(true);
    const lo = walkRoute(bas, 0, undefined, { unplated: true }).estimate.dmg, hi = walkRoute(bas, 0).estimate.dmg;
    expect(hi - lo).toBe(30); // +40 against +10 at 1 star (NUM-1: x10, was toBeCloseTo(3, 9): +4 against +1; whole now, so exact)
    // the rated damage per payload on that belt: rateDeck's offense with the breaker, against offense with the walk's
    // big number counted in full (BREAKER_SHARE 1) and with its floor (0): the share it reads is BREAKER_SHARE
    const off = (share: number) => rateDeck(bas, RATING_CURVE, FIGHT_T, undefined, share).offense;
    const r = (off(BREAKER_SHARE) - off(0)) / (off(1) - off(0));
    expect(r).toBeCloseTo(BREAKER_SHARE, 6);
  });
});

describe("B1 M1: the race reference decks keep their mirrored rigs", () => {
  const HEROES = ["foundry", "bastion", "metronome", "siphon"] as const;

  it("every rig of every reference deck works a belt, on every day", () => {
    for (const h of HEROES) for (let d = 1; d <= 10; d++) {
      const b = raceRefBuild(h, d);
      const busy = new Set(rigHits(b).flat(2).map((x) => x.uid));
      for (const p of b.items) if (ITEMS[p.def].kind === "gate") expect(busy.has(p.uid), `${h} d${d} ${p.def} at (${p.x},${p.y})`).toBe(true);
    }
  });

  it("FOUNDRY: both CRUCIBLE belts are worked from day 1 and stay in sync; no CALIBRATION on its starved guns", () => {
    for (let d = 1; d <= 10; d++) {
      const b = raceRefBuild("foundry", d);
      const w = worked(b);
      expect(w[0].length, `d${d} belt A`).toBeGreaterThan(0);
      expect(w[1].length, `d${d} belt B`).toBeGreaterThan(0);
      expect(syncedTurrets(b), `d${d}`).toEqual([0]);
      expect(b.mods.map((m) => m.def), `d${d}`).not.toContain("calibrate");
    }
    expect(worked(raceRefBuild("foundry", 1))).toEqual([["whetstone"], ["counterweight"]]);
    // from day 7 a STAMP PRESS feeds gun 2, and from day 8 its belt is worked too
    expect(worked(raceRefBuild("foundry", 8))[2]).toEqual(["heatjacket"]);
  });

  it("SIPHON: the ECHO belt is worked from day 1, and no CALIBRATION sits on either starved gun", () => {
    for (let d = 1; d <= 10; d++) {
      const b = raceRefBuild("siphon", d);
      expect(worked(b)[1].length, `d${d} ECHO`).toBeGreaterThan(0);
      expect(b.mods.map((m) => m.def), `d${d}`).not.toContain("calibrate");
    }
  });

  it("BASTION and METRONOME: the press belt (day 5) is worked from day 6 by its own rigs", () => {
    for (const h of ["bastion", "metronome"] as const) for (let d = 6; d <= 10; d++) {
      const b = raceRefBuild(h, d);
      const press = b.routes.findIndex((r) => itemByUid(b, r.factory)?.def === "press");
      expect(press, `${h} d${d}`).toBeGreaterThan(0);
      expect(worked(b)[press].length, `${h} d${d} press belt`).toBeGreaterThan(0);
    }
  });

  it("each purchase stays a part on the deck: a repeat copy only as the written ★2 (FOUNDRY and SIPHON, day 10)", () => {
    for (const h of HEROES) for (let d = 1; d <= 10; d++) {
      const b = raceRefBuild(h, d);
      const twos = [...b.items, ...b.mods].filter((p) => starsOf(p) > 1).map((p) => `${p.def}*${starsOf(p)}`);
      expect(twos, `${h} d${d}`).toEqual((h === "foundry" || h === "siphon") && d === 10 ? ["whetstone*2"] : []);
    }
    // the ★2 WHETSTONE keeps the first copy's cell: FOUNDRY's on belt A at (1,3), SIPHON's on the DRAG belt at (1,3)
    for (const h of ["foundry", "siphon"] as const) {
      const w = raceRefBuild(h, 10).items.find((p) => p.def === "whetstone")!;
      expect([w.x, w.y], h).toEqual([1, 3]);
      expect(K(w.x, w.y)).toBe(K(1, 3));
    }
  });
});
