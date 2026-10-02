// 0.8.0 H1 M1 (REQ-BFG-011): FOUNDRY's and BASTION's art in today's render code (src/render/raceArt.ts, ported from the
// race-art branch raceart 0c094b2). Node has no canvas, so this checks the pure parts: the palettes, the silhouettes,
// the turret looks and muzzles, the chute glow, the ammo kinds and the portraits. The pixels themselves are checked in
// Chromium by tools/fwDigest.ts (every Furnace/Weaver sprite, scene and battle frame hashes equal on v070-rc and here)
// and shown on the contact sheet (tools/heroesArtSheet.ts; output-H1/art).
import { describe, expect, it } from "vitest";
import { C, FACTION } from "../src/render/palette";
import {
  RACE_DECK_SALT, isArtRace, isRaceAmmo, raceChuteMouth, raceInside, raceSpanRadius, raceTurretLook,
} from "../src/render/raceArt";
import { muzzleX, muzzleY, turretPivotX, turretPivotY } from "../src/render/cruiser";
import { HULL_A, HULL_L, frameForHull, turnX, turnY } from "../src/render/frame";
import { TREAD_HX, TREAD_HY0, TREAD_LEN, TREAD_W } from "../src/render/hull";
import { TURRET_TIP } from "../src/render/turret";
import { portraitPixels } from "../src/render/portraits";
import { AMMO, HEROES } from "../src/sim/content";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { turretSlots } from "../src/sim/deck";

describe("the human and dwarf palettes", () => {
  it("are the race art's, no longer the elf and orc placeholders; orc and elf are untouched", () => {
    expect(FACTION.human).not.toEqual(FACTION.elf);
    expect(FACTION.dwarf).not.toEqual(FACTION.orc);
    expect([FACTION.human.hull0, FACTION.human.hull2, FACTION.human.hull4, FACTION.human.trim1, FACTION.human.glow])
      .toEqual([C.bsteel0, C.bsteel2, C.bsteel4, C.brass2, C.yellow]);
    expect([FACTION.dwarf.hull0, FACTION.dwarf.hull2, FACTION.dwarf.hull4, FACTION.dwarf.trim1, FACTION.dwarf.glow])
      .toEqual([C.stone0, C.stone2, C.stone4, C.steel1, C.rune3]);
    // FURNACE's and WEAVER's palettes, pinned as 0.7.0 has them
    expect(FACTION.orc).toEqual({
      hull0: C.rust0, hull1: C.rust1, hull2: C.rust2, hull3: C.rust3, hull4: C.rust4, trim0: C.steel0, trim1: C.steel1, trim2: C.steel2,
      deck0: "#1C1E22", deck1: "#272A2E", deck2: "#33373B", glow: C.fire3,
    });
    expect(FACTION.elf).toEqual({
      hull0: C.verd0, hull1: C.verd1, hull2: C.verd2, hull3: C.verd3, hull4: C.verd4, trim0: C.brass1, trim1: C.brass2, trim2: C.brass3,
      deck0: "#16232A", deck1: "#1E2F37", deck2: "#283C45", glow: C.ice,
    });
    expect(HEROES.foundry.faction).toBe("human");
    expect(HEROES.bastion.faction).toBe("dwarf");
  });

  it("only human and dwarf hulls take the race art", () => {
    expect((["orc", "elf", "human", "dwarf", "beastfolk", "unaligned"] as const).filter(isArtRace)).toEqual(["human", "dwarf"]);
  });
});

describe("the hull silhouettes", () => {
  const cells = (race: "human" | "dwarf") => {
    let n = 0;
    for (let y = 0; y < HULL_L; y++) for (let x = 0; x < HULL_A; x++) if (raceInside(race, x, y)) n++;
    return n;
  };

  it("are mirror-symmetric, and keep the tread channels, the deck well and the bow band inside", () => {
    for (const race of ["human", "dwarf"] as const) {
      for (let y = 0; y < HULL_L; y++) for (let x = 0; x < HULL_A; x++) expect(raceInside(race, x, y), `${race} ${x},${y}`).toBe(raceInside(race, HULL_A - 1 - x, y));
      for (const tx of TREAD_HX) for (let y = TREAD_HY0; y < TREAD_HY0 + TREAD_LEN; y++) for (let x = tx; x < tx + TREAD_W; x++) {
        expect(raceInside(race, x, y), `${race} tread ${x},${y}`).toBe(true);
      }
      for (let x = 13; x < HULL_A - 13; x++) expect(raceInside(race, x, 1), `${race} bow band ${x}`).toBe(true);
      expect(raceInside(race, -1, 50) || raceInside(race, HULL_A, 50) || raceInside(race, 50, HULL_L)).toBe(false);
    }
  });

  it("human: rolled-plate chamfers (6 px at the bow, 3 at the stern); dwarf: stepped masonry corners", () => {
    expect([raceInside("human", 0, 0), raceInside("human", 5, 0), raceInside("human", 6, 0), raceInside("human", 0, 6)]).toEqual([false, false, true, true]);
    expect([raceInside("human", 0, HULL_L - 1), raceInside("human", 3, HULL_L - 1)]).toEqual([false, true]);
    expect([raceInside("dwarf", 8, 2), raceInside("dwarf", 9, 2), raceInside("dwarf", 4, 5), raceInside("dwarf", 5, 5), raceInside("dwarf", 1, 8), raceInside("dwarf", 2, 8)])
      .toEqual([false, true, false, true, false, true]);
    expect(cells("human")).toBeGreaterThan(cells("dwarf")); // the dwarf's steps cut more than the human's chamfers
    expect(RACE_DECK_SALT).toEqual({ human: 11, dwarf: 13 }); // FURNACE's 3 and WEAVER's 7 stay theirs
  });
});

describe("the turrets", () => {
  it("FOUNDRY's MEDIUM guns and BASTION's HEAVY gun fire from one barrel 19 px out; a human HEAVY keeps today's twin barrels", () => {
    expect(raceTurretLook("medium", "human")).toMatchObject({ tip: 19, twin: false, chargeR: 8.5, pip: 12 });
    expect(raceTurretLook("heavy", "dwarf")).toMatchObject({ tip: 19, twin: false, chargeR: 10.5, pip: 13 });
    expect(raceTurretLook("heavy", "human")).toMatchObject({ tip: 20, twin: true, chargeR: 9.5, pip: 12 });
    expect(raceTurretLook("light", "dwarf")).toMatchObject({ tip: 15, twin: false, chargeR: 6.5, pip: 9 });
    expect(raceTurretLook("medium", "human").ramp).toHaveLength(5);
    expect(raceSpanRadius("medium")).toBe(12);
    expect(raceSpanRadius(undefined)).toBe(14); // an empty slot keeps room for a heavy
  });

  it("muzzles: FURNACE and WEAVER as before (TURRET_TIP, twin heavy barrels); FOUNDRY's and BASTION's guns from their one barrel", () => {
    for (const facing of [0, 1, 2, 3] as const) {
      const f = frameForHull(facing, 10, 20);
      for (const hero of ["furnace", "weaver", "foundry", "bastion"] as const) {
        turretSlots({ hero }).forEach((s, i) => {
          if (!s.td) return;
          const fw = hero === "furnace" || hero === "weaver";
          const twin = fw && s.td.kind === "heavy";
          const tip = fw ? TURRET_TIP[s.td.kind] : 19; // FOUNDRY's MEDIUM and BASTION's HEAVY: the race art's 19
          const px = turretPivotX(f, s.td.col0, s.td.width), py = turretPivotY(f, s.td.col0, s.td.width);
          for (const barrel of [0, 1]) {
            const u = twin ? (barrel ? 3.5 : -3.5) : 0;
            expect([muzzleX(f, hero, i, barrel), muzzleY(f, hero, i, barrel)], `${hero} slot ${i} facing ${facing} barrel ${barrel}`)
              .toEqual([px + turnX(f, u, -tip), py + turnY(f, u, -tip)]);
          }
        });
      }
    }
  });
});

describe("the factories and the ammo", () => {
  it("the CRUCIBLE's chute glows molten yellow, the WARDWORKS' rune blue; every other factory keeps its own", () => {
    expect([raceChuteMouth("crucible"), raceChuteMouth("wardworks")]).toEqual([C.yellow, C.rune2]);
    for (const id of ["kiln", "loom", "press", "slagpot", "clockworks", "sump", "constructor", "toString"]) expect(raceChuteMouth(id), id).toBeUndefined();
  });

  it("ALLOY BLANK, ALLOY SLUG and BULWARK SLUG have art; no Furnace or Weaver ammo kind does", () => {
    expect(Object.keys(AMMO).filter(isRaceAmmo).sort()).toEqual(["alloy", "blank", "bulwark"]);
    for (const k of ["cinder", "thread", "plain", "shot", "slag", "ember", "spark", "constructor", "hasOwnProperty"]) expect(isRaceAmmo(k), k).toBe(false);
  });
});

describe("the portraits", () => {
  it("FOUNDRY: a guild face under a leather cap and brass goggles, a dark moustache, a blue shirt and a leather apron", () => {
    const px = portraitPixels("foundry").px;
    for (const c of ["skin2", "wood2", "brass2", "ice", "wood0", "bsteel2", "maroon", "yellow"] as const) expect(px, c).toContain(c);
  });

  it("BASTION: an iron helm with a rune-lit brow, rune-blue eyes, a big nose, a braided ginger beard, stone pauldrons", () => {
    const px = portraitPixels("bastion").px;
    for (const c of ["steel2", "rune2", "rune3", "skin1", "cop2", "cop1", "cop3", "stone3", "stone4"] as const) expect(px, c).toContain(c);
  });

  it("start decks still name their own signature factory (the art is keyed by it)", () => {
    expect(heroStartBuild("foundry").items.map((p) => p.def)).toContain("crucible");
    expect(heroStartBuild("bastion").items.map((p) => p.def)).toContain("wardworks");
  });
});
