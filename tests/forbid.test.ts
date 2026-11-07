// 0.6.2 TUNE-M, T1 (ref/BRIEF-final-062-tune.md): the par player's optional `forbid` knob, a part's control
// (tools/parBench.ts --forbid). The caravan still rolls the part and the player still judges its offers (the same RNG
// draws), but it never takes one and spends the gold elsewhere. No policy sets it, so the par field is unchanged.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maxGoldByDay, validateBuild } from "../src/net/validate";
import { PLAYER_DAYS, PLAYER_POLICY, playerRun } from "../src/sim/harness/player";
import type { Build } from "../src/sim/deck";
import { boughtCost } from "../src/sim/harness/standins"; // FLIP-X2: the bought deck's value (the runes' HULL and BELT out)
import { runeGrants } from "../src/sim/runes"; // FLIP-X2: the runes' dawn gold in the day's budget
import { npcDayRules } from "../src/sim/npcDay"; // AZ-BUMP (the flip): the road-fed deck's budget
import { withShrine } from "../src/game/shrine"; // BUMP-1F (ENCHANT-2 T3): the road-event bag without the ASH SHRINE for the gold identity
import { GATES, setGates } from "../src/sim/gates"; // BUMP-1F (GATES default): this file's world is the one before the three converters
// BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default): was no hook; this file's fixtures and pins are the world before the three converters, so every test runs with GATES off, as its pins were measured, and the afterEach puts the shipped value back (even if the test throws)
beforeEach(() => { setGates(false); });
afterEach(() => { setGates(GATES); });

const holds = (b: Build, def: string): boolean => b.items.some((p) => p.def === def) || b.mods.some((m) => m.def === def);
const CASES: [("furnace" | "weaver"), string][] = [["furnace", "temper"], ["weaver", "temper"], ["weaver", "dragchain"], ["furnace", "flak"]];

describe("TUNE-M T1: the par player's forbid knob", () => {
  it("no policy sets it", () => {
    expect(PLAYER_POLICY.typical.forbid).toBeUndefined();
    expect(PLAYER_POLICY.sharp.forbid).toBeUndefined();
  });

  // BUMP-1F (ENCHANT-2 T3, RULING-BUMP1F-R3.1): the road-event bag is read WITHOUT the ASH SHRINE (withShrine false, the state-B precedent of tests/enchant1.bots): the shrine's cargo card gives
  // a cargo part away (the bot's card 1, shrineBot.ts), whose value no PlayerDay field names, so a day after it breaks the identity below by that value (furnace s2 d10: 170 of 173); was no wrapper
  it("a forbidden part is judged but never taken; the decks stay legal and the gold adds up", () => withShrine(() => {
    let judged = 0;
    for (const [hero, def] of CASES) {
      for (const seed of [1, 2, 3, 4]) {
        const run = playerRun(hero, PLAYER_DAYS, seed, {
          tune: { forbid: def },
          onDecide: (_run, cands, pick) => {
            if (cands.some((c) => c.def === def)) judged++;
            expect(pick, `${hero} s${seed}: never picks ${def}`).not.toBe(def);
          },
        });
        for (const d of run) {
          expect(d.buys.some((x) => x.def === def), `${hero} s${seed} d${d.day}: bought ${def}`).toBe(false);
          expect(holds(d.build, def), `${hero} s${seed} d${d.day}: holds ${def}`).toBe(false);
          // AZ-BUMP (the flip, NPC_DAY): the par player fights the Medium warlord every day, so its deck is road-fed: validateBuild's
          // strict budget line (the shop's gold alone) is left to the budget's own rule below, as standins.ts writtenProblems
          // leaves it; every other strict line stands
          expect(validateBuild(d.build, d.day).errors.filter((e) => !(npcDayRules() && e.startsWith("budget: "))), `${hero} s${seed} d${d.day}`).toEqual([]);
          // FLIP-X2 (REQ-BFG-058, BOT_RUNES on): the par player takes a rune each dawn. d.value (buildCost) charges a HULL or
          // BELT rune's grant as ARMOR / BELT PACKs, and its dawn-gold runes add to the day's gold, so the gold adds up as the
          // bought deck (boughtCost, as caravanCand and validate.ts cost it) + rerolls + purse + sold loss = d.budget, the
          // day's maxGoldByDay + its runes' dawn gold (runeGrants); without runes both are as before (was
          // d.value + d.rerollGold + d.gold + d.soldLoss = maxGoldByDay(d.day): 32 = 27 on furnace s1 d3, IRON SKIN's 150 hull)
          // AZ-BUMP (the flip, NPC_DAY): d.budget also holds the road's gold and drops by this dusk (player.ts playerRun: + roadGold
          // + roadDrops; absent with NPC_DAY off), and the gold adds up with the value left in cargo (d.cargo); was maxGoldByDay +
          // the runes' gold alone (12 vs 8 on furnace s1 d1: day 1's Medium win, +4)
          expect(d.budget, `${hero} s${seed} d${d.day}`).toBe(maxGoldByDay(d.day) + runeGrants(d.build.runes, d.day).gold + (d.roadGold ?? 0) + (d.roadDrops ?? 0));
          // BUMP-1F (ENCHANT on by default, RULING-BUMP1F-R5 R5.2 (2); ENCHANT-1 E6.4): + the gold the par player spent at the ENCHANTER (PlayerDay.wordGold: it joins the deck's cost);
          // was boughtCost + rerollGold + gold + soldLoss + cargo (furnace s1 d3: 34 vs 42)
          expect(boughtCost(d.build) + d.rerollGold + d.gold + d.soldLoss + (d.wordGold ?? 0) + (d.cargo ?? 0), `${hero} s${seed} d${d.day}`).toBe(d.budget);
        }
      }
    }
    expect(judged, "the caravan still rolls the forbidden parts and the player judges them").toBeGreaterThan(0);
  }, false), 120_000);

  it("a run stays aligned until it would first take the part: before that day the decks are identical", () => {
    let took = 0, never = 0;
    for (const [hero, def] of CASES) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const base = playerRun(hero, PLAYER_DAYS, seed), ctrl = playerRun(hero, PLAYER_DAYS, seed, { tune: { forbid: def } });
        // AZ-BUMP (the flip, NPC_DAY; cap's ruling): a run takes a part by a buy or as a warlord's drop (PlayerDay.road.drop), and
        // the knob now declines a forbidden drop as it refuses a forbidden buy (player.ts parNpcDay), so the first take is the
        // first day of either (was the first buy; fixabe.forbid.test.ts counts it the same way)
        const first = base.findIndex((d) => d.buys.some((x) => x.def === def) || d.road?.drop === def);
        const upto = first < 0 ? PLAYER_DAYS : first;
        if (first < 0) never++;
        else took++;
        for (let i = 0; i < upto; i++) expect(JSON.stringify(ctrl[i].build), `${hero} ${def} s${seed} d${i + 1}`).toBe(JSON.stringify(base[i].build));
        // the day it would have taken the part, it takes something else: the deck still reaches the policy's floor
        if (first >= 0) expect(ctrl[first].value, `${hero} ${def} s${seed} d${first + 1}`).toBeGreaterThanOrEqual(Math.ceil(PLAYER_POLICY.typical.floor * maxGoldByDay(first + 1)) - 3);
      }
    }
    expect(took, "some runs take the part").toBeGreaterThan(0);
    expect(never, "some runs never take it").toBeGreaterThan(0);
  }, 120_000);
});
