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
import { playerRoadLog, playerRun } from "../src/sim/harness/player"; // AZ-BUMP: + the par run's road log
import { caravanCandidate, CARAVAN_POLICY, type CaravanDeck } from "../src/sim/harness/caravan"; // BUMP-1E: + CARAVAN_POLICY, CaravanDeck (the candidate's cargo)
import { rivalBuild, RIVALS } from "../src/sim/rivals";
import {
  BOT_RUNES, RUNE_LIST, RUNES, boardThemeCount, botRuneList, botRunePick, botTakeRune, runeOffer, runeProblem, type RuneTheme,
} from "../src/sim/runes";
import { validateBuild } from "../src/net/validate";
import { newRun, pendingRune, takeRune } from "../src/game/run";
import { captainRuneSeed, captainRunes, captainRunesText } from "../tools/genCaptainRunes";
import { openRunesRules } from "../src/sim/openRunes"; // HULL-ON (the flip, OPEN_RUNES): the bots' and the game's offer rule
import { SCALE_RIGS, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the scaling rules ship on; the 0.9.11 candidates are read under withScaleRigs(fn, false)

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
    // FLIP-X2 (REVIEW-TUNEX): COAL CHUTE is dormant (DORMANT_RUNES): runeList() leaves it out, so the picker never takes it
    // even when handed one (no dawn offers it): the board's armor (500 hull, 2 packs) wins (was coal_chute). FURNACE's live
    // style rune ASH KINDLE is its first pick, whatever the board holds
    // BAL-2 (the lines: DORMANT_RUNES empty): COAL CHUTE is offered again and in runeList(), so FURNACE's style takes it
    // first, whatever the board holds (was iron_skin, the board's armor)
    expect(botRunePick(["iron_skin", "coal_chute", "oiled_cogs"], "furnace", b)).toBe("coal_chute");
    expect(botRunePick(["iron_skin", "ash_kindle", "oiled_cogs"], "furnace", b)).toBe("ash_kindle");
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
    // FLIP-X2 (REVIEW-TUNEX): COAL CHUTE is dormant, so the picker never takes it: TAR BARREL (belts 2) is the only card
    // left (was coal_chute); ASH KINDLE, FURNACE's live style rune, reads the same 3 HEAT pieces and wins over the belts
    // BAL-2 (the lines: DORMANT_RUNES empty): COAL CHUTE is a card again and reads the 3 HEAT pieces (furnace 3), so it wins
    // over TAR BARREL's belts 2 (was tar_barrel)
    expect(botRunePick(["tar_barrel", "coal_chute"], "metronome", b)).toBe("coal_chute");
    expect(botRunePick(["tar_barrel", "ash_kindle"], "metronome", b)).toBe("ash_kindle");
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
        // HULL-ON (the flip, OPEN_RUNES): the game's dawn offer is the open one (run.ts pendingRune reads the switch), so the
        // bot takes from the same offer: botTakeRune's `open` is the switch, as the par player passes it (was the closed default)
        const got = botTakeRune(b, run.seed, 1, hero, true, false, 0, openRunesRules())!;
        expect(pendingRune(run)!.ids).toContain(got.id);
        const gold = run.gold;
        expect(takeRune(run, got.id).ok).toBe(true);
        expect(b).toEqual(run.build);
        expect(run.gold - gold).toBe(got.gold);
      }
    }
  });

  it("is off by default: the switch is off, and off leaves the build untouched", () => {
    // FLIP-X2 (REQ-BFG-058, release X): BOT_RUNES is on (was false), so the default takes the pick, as an explicit true does;
    // off (false) still leaves the build untouched
    expect(BOT_RUNES).toBe(true);
    const b = heroStartBuild("furnace", 1), before = JSON.stringify(b);
    expect(botTakeRune(b, 1, 1, "furnace", false)).toBeNull();
    expect(JSON.stringify(b)).toBe(before);
    expect(botTakeRune(b, 1, 2, "furnace", true)).toBeNull(); // missed day 1's dawn: no pick owed
    expect(JSON.stringify(b)).toBe(before);
    const on = heroStartBuild("furnace", 1), got = botTakeRune(on, 1, 1, "furnace", true);
    expect(got).not.toBeNull();
    expect(botTakeRune(b, 1, 1)).toEqual(got); // FLIP-X2: the default is the switch, on (was null)
    expect(b).toEqual(on);
  });
});

describe("RUNES-2a the par player behind the switch", () => {
  it("switch off: the run holds no runes and plays exactly as with botRunes false", () => {
    // FLIP-X2 (REQ-BFG-058): BOT_RUNES is on, so the switch-off run is botRunes: false on the traced run too (was its
    // default); the default, traced or cached, is the botRunes: true run
    const traced = playerRun("bastion", 10, 3, { onReroll: () => {}, botRunes: false }); // traced: never the cache
    const off = playerRun("bastion", 10, 3, { botRunes: false });
    expect(off).toEqual(traced);
    for (const d of off) {
      expect(d.build.runes).toBeUndefined();
      expect(JSON.stringify(d.build)).not.toContain("runes");
      expect(d.budget).toBe(traced[d.day - 1].budget);
    }
    const on = playerRun("bastion", 10, 3, { botRunes: true });
    expect(playerRun("bastion", 10, 3, { onReroll: () => {} })).toEqual(on);
    expect(playerRun("bastion", 10, 3)).toEqual(on);
    expect(on.map((d) => d.build.runes?.length)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // AZ-BUMP (the flip): 600 s, a host timeout under the 1.5-CPU quota (the GATE RULE; 30 s hit in run 5's group check:
    // the par runs fight a warlord every day), not the rule
  }, 600_000);

  it("switch on: every dawn takes one offered rune (runeProblem passes with the run seed) and every deck validates", () => {
    for (const [hero, seed] of [["furnace", 1], ["weaver", 2], ["foundry", 1], ["bastion", 2]] as [HeroId, number][]) {
      const days = playerRun(hero, 10, seed, { botRunes: true });
      for (const d of days) {
        const runes = d.build.runes ?? [];
        expect(runes.length).toBe(d.day);
        // HULL-ON (the flip, OPEN_RUNES): the par player's dawn runes follow the switch (player.ts: botTakeRune's `open`), so
        // each dawn is re-derived on the open offers (runeProblem's and the player mode's `open`; was the closed default)
        expect(runeProblem(runes, d.day, hero, runSeed(hero, seed), "atMost", false, -1, openRunesRules())).toBeNull();
        // AZ-BUMP (the flip, NPC_DAY): the par run fights the Medium warlord every day (PAR-AZ), so its deck holds road gold and
        // drops, which the strict mode's budget (the shop's gold and its runes' alone) refuses by design; the deck is checked
        // as its upload is (REVIEW-PARAZ N3, tools/samplePool.ts seedGhost): the player mode, with the run seed (each dawn's
        // offer re-derived, exactly one rune a dawn) and the run's road log (player.ts playerRoadLog). Was the strict mode
        const log = playerRoadLog(days, d.day);
        const v = validateBuild(d.build, d.day, "player", { seed: runSeed(hero, seed), ...(log.length ? { road: log } : {}), openRunes: openRunesRules() });
        expect(v.errors).toEqual([]);
        // the run keeps every rune: each dusk's list extends the day before's
        if (d.day > 1) expect(runes.slice(0, d.day - 1)).toEqual(days[d.day - 2].build.runes);
      }
      // day 1's pick is the picker's on day 1's offer and the starting deck
      const start = heroStartBuild(hero, 1);
      expect(days[0].build.runes![0].id).toBe(botRunePick(runeOffer(runSeed(hero, seed), 1, hero, [], openRunesRules()), hero, start)); // HULL-ON (OPEN_RUNES): the switch's offer
    }
  });
});

describe("RUNES-2a the caravan stand-ins inherit the par player's switch", () => {
  /** BUMP-1E: the worth of the parts a candidate's run holds in cargo at the dusk of day 6 (player.ts PlayerDay: boughtCost(build) +
   *  rerollGold + gold + soldLoss + cargo = budget; caravan.ts: "cargoGold stays the gold's worth in cargo"). The candidate's own par
   *  run, as caravanDeck asks for it (the same cache entry). */
  // BUMP-1F (ENCHANT on by default, RULING-BUMP1F-R5 R5.2 (2); ENCHANT-1 E6.4): + the gold the run spent at the ENCHANTER by that dusk (PlayerDay.wordGold): caravan.ts books cargoGold as the RESIDUAL (spent + drops - value - rerolls - sale losses),
  // so the ENCHANTER's gold lands in it beside the cargo's worth; was the cargo alone (candidate 0, botRunes on: 20 of 12, the 8 g of its words)
  const cargoWorth = (c: CaravanDeck, botRunes: boolean): number => {
    const d = playerRun("weaver", 10, c.meta.seed, { ...CARAVAN_POLICY[c.meta.policy], maxStars: 2, botRunes })[5];
    return (d.cargo ?? 0) + (d.wordGold ?? 0);
  };

  it("a caravan candidate holds a rune a dawn with botRunes on, none off, and its gold adds up either way", () => {
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the scaling rules ship on, so these candidates are the bb-0.12.0 world's; the 0.9.11 world's are read under the off switch below
    for (let idx = 0; idx < 4; idx++) { // the policy mix: typical, typical, sharp, loose
      // FLIP-X2 (REQ-BFG-058): BOT_RUNES is on, so the switch-off candidate is an explicit false (was the default) and the
      // default is the botRunes-on candidate
      const off = caravanCandidate("weaver", 6, 1, idx, 2, false), on = caravanCandidate("weaver", 6, 1, idx, 2, true);
      expect(off.build.runes).toBeUndefined();
      expect(caravanCandidate("weaver", 6, 1, idx, 2)).toEqual(on);
      expect(on.build.runes).toHaveLength(6);
      // HULL-ON (the flip, OPEN_RUNES): the candidate's par run takes its dawn runes on the switch's offers (was closed)
      expect(runeProblem(on.build.runes, 6, "weaver", runSeed("weaver", on.meta.seed), "atMost", false, -1, openRunesRules())).toBeNull();
      // BUMP-1E: was expect(on.meta.cargoGold).toBe(off.meta.cargoGold). The two runs of a candidate are not the same run (the runes change
      // every day after the first dawn), so equal cargo was never promised: in the 0.9.11 world candidate 0's two runs each ended day 6 with
      // 6 g in cargo, in the bb-0.12.0 world its botRunes run wins its day-6 road fight and the MANTLET it drops finds no place (road.placed
      // false: 4 g in cargo) while the off run lost that fight and holds nothing (cargoGold 4 on, 0 off; candidates 1-3 hold none in either
      // run). The day's gold still adds up (the dawn-gold runes' gold is in it, runeGrants) exactly when cargoGold is the worth of the
      // run's own cargo, so that is what each run is held to
      expect(on.meta.cargoGold, `candidate ${idx}, botRunes on`).toBe(cargoWorth(on, true));
      expect(off.meta.cargoGold, `candidate ${idx}, botRunes off`).toBe(cargoWorth(off, false));
    }
    // BUMP-1E: the 0.9.11 world (the scaling rules off) keeps the old pin: there both runs of a candidate end day 6 with the same cargo (6 g on candidate 0, none on the others)
    withScaleRigs(() => {
      for (let idx = 0; idx < 4; idx++) {
        const off = caravanCandidate("weaver", 6, 1, idx, 2, false), on = caravanCandidate("weaver", 6, 1, idx, 2, true);
        expect(on.meta.cargoGold, `candidate ${idx}, scaling off`).toBe(off.meta.cargoGold); // the dawn-gold runes' gold is in the day's gold (runeGrants)
        expect(on.meta.cargoGold, `candidate ${idx}, scaling off`).toBe(cargoWorth(on, true));
      }
    }, false);
    // AZ-BUMP (the flip): 600 s, a host timeout under the 1.5-CPU quota (the GATE RULE; 30 s hit in run 5's group check:
    // the candidates' runs fight a warlord every day), not the rule
  }, 600_000);
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
