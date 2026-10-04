// RUNES-2a (REQ-BFG-058, R1b-2 1.6): the bots' rune picker (src/sim/runes.ts botRunePick, boardThemeCount, botTakeRune,
// botRuneList), THE switch BOT_RUNES (off in this job), its wiring into the par player (src/sim/harness/player.ts
// PlayerOpts.botRunes, which the caravan stand-ins and the seed pool's race decks inherit) and the captains' generator
// (tools/genCaptainRunes.ts). The pinned pools, stand-ins and goldens themselves are held by their own tests
// (runes.parity, rc.seedpool, standInPool.*, harness.player): with the switch off they must not move.

import { describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import { ITEMS, type HeroId } from "../src/sim/content";
import { cloneBuild, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { playerRun } from "../src/sim/harness/player";
import { caravanCandidate } from "../src/sim/harness/caravan";
import { rivalBuild, RIVALS } from "../src/sim/rivals";
import {
  BOT_RUNES, RUNE_LIST, RUNES, boardThemeCount, botRuneList, botRunePick, botTakeRune, runeOffer, runeProblem, type RuneTheme,
} from "../src/sim/runes";
import { validateBuild } from "../src/net/validate";
import { newRun, pendingRune, takeRune } from "../src/game/run";
import { captainRuneSeed, captainRunes, captainRunesText } from "../tools/genCaptainRunes";

/** A hand-made board: no items, routes or gear; the hero's starting turrets (Build.turrets absent). */
const board = (hero: HeroId, extra: Partial<Build> = {}): Build => ({ hero, items: [], routes: [], mods: [], beltCap: 0, hullBonus: 0, ...extra });
const at = (def: string, uid: number, stars?: number) => ({ uid, def, x: uid, y: 3, ...(stars ? { stars } : {}) });
const first = (...ids: string[]): string => RUNE_LIST.find((d) => ids.includes(d.id))!.id; // catalogue order
/** The par player's run seed (player.ts startRun): the seed its shop and its rune offers draw on. */
const runSeed = (hero: HeroId, seed: number): number => hashSeed("par-player-run", hero, seed);
/** One ARMOR PACK's hull (the "armor" theme counts the bought hull in packs). NUM-1: 250, x10 of 25. */
const PACK = ITEMS.plating.supply!.hull!;

describe("RUNES-2a botRunePick: style, then the board's themes, then catalogue order", () => {
  it("takes the hero's own style first, whatever the board holds", () => {
    const b = board("furnace", { hullBonus: 500, items: [at("press", 1), at("doublestamp", 2)] });
    expect(botRunePick(["iron_skin", "coal_chute", "oiled_cogs"], "furnace", b)).toBe("coal_chute");
    expect(botRunePick(["loose_thread", "war_edge"], "weaver", b)).toBe("loose_thread");
    expect(botRunePick(["twin_nails", "iron_skin"], "foundry", b)).toBe("twin_nails");
    expect(botRunePick({ day: 1, tier: "common", drawn: "common", ids: ["tar_barrel", "rivet_hoard"] }, "bastion", b)).toBe("rivet_hoard");
  });

  it("else the theme with the most pieces on the board", () => {
    // weaver's starting layout: 3 DART GUNS (turrets 3); hull 500 = 2 ARMOR PACKs (armor 2); no factory
    const b = board("weaver", { hullBonus: 2 * PACK }); // NUM-1: 2 packs of 250 (was a bare 50)
    expect(boardThemeCount("turrets", b)).toBe(3);
    expect(boardThemeCount("armor", b)).toBe(2);
    expect(boardThemeCount("factories", b)).toBe(0);
    expect(botRunePick(["iron_skin", "oiled_cogs", "sharp_scrap"], "weaver", b)).toBe("sharp_scrap");
    const f = board("weaver", { hullBonus: 2 * PACK, items: [at("press", 1), at("doublestamp", 2), at("shottower", 3), at("hotswap", 4)] });
    expect(boardThemeCount("factories", f)).toBe(4);
    expect(botRunePick(["iron_skin", "oiled_cogs", "sharp_scrap"], "weaver", f)).toBe("oiled_cogs");
  });

  it("reads another style's keyword from the pieces' specs (an NPC race has no style of its own)", () => {
    // the KILN (cinder slugs heat as they ride) and two HEAT JACKETs: furnace 3; belts 2 rigs + 0 belts = 2
    const b = board("metronome", { items: [at("kiln", 1), at("heatjacket", 2), at("heatjacket", 3)] });
    expect(boardThemeCount("furnace", b)).toBe(3);
    expect(boardThemeCount("belts", b)).toBe(2);
    expect(boardThemeCount("factories", b)).toBe(1);
    expect(botRunePick(["tar_barrel", "coal_chute"], "metronome", b)).toBe("coal_chute");
    // the LOOM frays (weaver), TWIN MOULD pours (foundry), PLATE ROLLER plates (bastion)
    const w = board("siphon", { items: [at("loom", 1), at("twinmould", 2), at("plateroller", 3)] });
    expect(["weaver", "foundry", "bastion"].map((t) => boardThemeCount(t as RuneTheme, w))).toEqual([1, 1, 1]);
  });

  it("ties and empty boards go by catalogue order, never by the offer's card order", () => {
    const b = board("metronome", { items: [at("heatjacket", 2)], routes: [{ factory: 9, cells: [1, 2] }], hullBonus: 2 * PACK }); // belts 2, armor 2 (NUM-1: hull 500, was 50)
    for (const offer of [["tar_barrel", "iron_skin"], ["iron_skin", "tar_barrel"]]) {
      expect(botRunePick(offer, "metronome", b)).toBe(first("tar_barrel", "iron_skin"));
    }
    for (const offer of [["fat_purse", "coin_purse"], ["coin_purse", "fat_purse"]]) { // gold counts 0
      expect(botRunePick(offer, "furnace", board("furnace"))).toBe(first("fat_purse", "coin_purse"));
    }
    expect(botRunePick([], "furnace", board("furnace"))).toBeNull();
  });

  it("counts an unknown theme 0, and 'stars' as the starred pieces", () => {
    const b = board("furnace", { items: [at("heatjacket", 1, 2), at("heatjacket", 2)] });
    expect(boardThemeCount("gold", b)).toBe(0);
    expect(boardThemeCount("no-such-theme" as RuneTheme, b)).toBe(0);
    expect(boardThemeCount("stars" as RuneTheme, b)).toBe(1);
  });
});

describe("RUNES-2a botTakeRune: applied as run.ts takeRune applies a pick", () => {
  it("matches the game's takeRune on a new run's first dawn", () => {
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) {
      for (const seed of [1, 7, 12345]) {
        const run = newRun(hero, seed, `bots-${hero}-${seed}`);
        const b = cloneBuild(run.build);
        const got = botTakeRune(b, run.seed, 1, hero, true)!;
        expect(pendingRune(run)!.ids).toContain(got.id);
        const gold = run.gold;
        expect(takeRune(run, got.id).ok).toBe(true);
        expect(b).toEqual(run.build);
        expect(run.gold - gold).toBe(got.gold);
      }
    }
  });

  it("is off by default: the switch is off, and off leaves the build untouched", () => {
    expect(BOT_RUNES).toBe(false);
    const b = heroStartBuild("furnace", 1), before = JSON.stringify(b);
    expect(botTakeRune(b, 1, 1)).toBeNull();
    expect(botTakeRune(b, 1, 1, "furnace", false)).toBeNull();
    expect(JSON.stringify(b)).toBe(before);
    expect(botTakeRune(b, 1, 2, "furnace", true)).toBeNull(); // missed day 1's dawn: no pick owed
  });
});

describe("RUNES-2a the par player behind the switch", () => {
  it("switch off: the run holds no runes and plays exactly as with botRunes false", () => {
    const traced = playerRun("bastion", 10, 3, { onReroll: () => {} }); // traced: never the cache
    const off = playerRun("bastion", 10, 3, { botRunes: false });
    expect(off).toEqual(traced);
    for (const d of off) {
      expect(d.build.runes).toBeUndefined();
      expect(JSON.stringify(d.build)).not.toContain("runes");
      expect(d.budget).toBe(traced[d.day - 1].budget);
    }
  });

  it("switch on: every dawn takes one offered rune (runeProblem passes with the run seed) and every deck validates", () => {
    for (const [hero, seed] of [["furnace", 1], ["weaver", 2], ["foundry", 1], ["bastion", 2]] as [HeroId, number][]) {
      const days = playerRun(hero, 10, seed, { botRunes: true });
      for (const d of days) {
        const runes = d.build.runes ?? [];
        expect(runes.length).toBe(d.day);
        expect(runeProblem(runes, d.day, hero, runSeed(hero, seed))).toBeNull();
        const v = validateBuild(d.build, d.day, "strict", { seed: runSeed(hero, seed) });
        expect(v.errors).toEqual([]);
        // the run keeps every rune: each dusk's list extends the day before's
        if (d.day > 1) expect(runes.slice(0, d.day - 1)).toEqual(days[d.day - 2].build.runes);
      }
      // day 1's pick is the picker's on day 1's offer and the starting deck
      const start = heroStartBuild(hero, 1);
      expect(days[0].build.runes![0].id).toBe(botRunePick(runeOffer(runSeed(hero, seed), 1, hero, []), hero, start));
    }
  });
});

describe("RUNES-2a the caravan stand-ins inherit the par player's switch", () => {
  it("a caravan candidate holds a rune a dawn with botRunes on, none off, and its gold adds up either way", () => {
    for (let idx = 0; idx < 4; idx++) { // the policy mix: typical, typical, sharp, loose
      const off = caravanCandidate("weaver", 6, 1, idx, 2), on = caravanCandidate("weaver", 6, 1, idx, 2, true);
      expect(off.build.runes).toBeUndefined();
      expect(off).toEqual(caravanCandidate("weaver", 6, 1, idx, 2, false));
      expect(on.build.runes).toHaveLength(6);
      expect(runeProblem(on.build.runes, 6, "weaver", runSeed("weaver", on.meta.seed))).toBeNull();
      expect(on.meta.cargoGold).toBe(off.meta.cargoGold); // the dawn-gold runes' gold is in the day's gold (runeGrants)
    }
  });
});

describe("RUNES-2a the captains' generator (tools/genCaptainRunes.ts)", () => {
  it("gives a sample captain a deterministic list of one offered rune a dawn, on its seed and named builds", () => {
    const id = "grimhold", hero = RIVALS[id].hero, seed = captainRuneSeed(id);
    expect(seed).toBe(hashSeed("captain-runes", id));
    const list = captainRunes(id);
    expect(list).toHaveLength(10);
    expect(captainRunes(id)).toEqual(list);
    expect(list.every((q) => RUNES[q] !== undefined)).toBe(true);
    for (let day = 1; day <= 10; day++) {
      expect(runeProblem(list.slice(0, day).map((q) => ({ id: q })), day, hero, seed)).toBeNull();
      expect(list[day - 1]).toBe(botRunePick(runeOffer(seed, day, hero, list.slice(0, day - 1)), hero, rivalBuild(id, day)));
    }
    expect(botRuneList(seed, hero, (d) => rivalBuild(id, d), 4)).toEqual(list.slice(0, 4));
    expect(captainRunesText()).toContain(`  ${id}: [${list.map((q) => JSON.stringify(q)).join(", ")}],`);
  });
});
