// HULL-1d (REQ-BFG-073; BRIEF-HULL1D 2 (a)2 and (e)2): the bots' REFIT swap of LAST CHANCE's part. With NPC_DAY on, a
// player gets REFIT before every dusk and can swap a cargo part in for a fitted piece of its kind (the old one to cargo).
// The bots' own swaps judged a fitted piece against the offer's price, 0 for a free part, so they never swapped it in.
// player.ts placeFreePart now tries refitSwap with NPC_DAY on, when no free spot rates a gain. Two states of HULL-1c's
// all-on LAST CHANCE bench (kit-hull1d/probes/lcpart.ts): a gear piece on a deck with every gear slot taken, and a rig on
// a deck where no free cell rates a gain. HULL_SCALE and LADDER_FIX on (as the bench); NPC_DAY on and off (each through
// its own setter, all put back after each test).
import { afterEach, describe, expect, it } from "vitest";
import { hashSeed, Rng } from "../src/core/rng";
import { ITEMS, type HeroId } from "../src/sim/content";
import { cloneBuild, type Build } from "../src/sim/deck";
import { placeFreePart, playerRun, rateOn } from "../src/sim/harness/player";
import { setHullScale } from "../src/sim/hullScale";
import { setLadderFix } from "../src/sim/ladderFix";
import { setNpcDay } from "../src/sim/npcDay";
import { newRun, type Run } from "../src/game/run";

afterEach(() => { // the shipped values (AZ-BUMP's flip; were false); place() sets every switch itself
  setNpcDay(true);
  setHullScale(true);
  setLadderFix(true);
});

/** A run around `board` on `day` (harness/lastChance.ts boardRun's form: cargo empty, uids after the board's). */
function boardRun(board: Build, hero: HeroId, day: number): Run {
  const run = newRun(hero, hashSeed("lastchance-bot-run", hero, day), `lc-bot-${hero}-${day}`);
  run.build = cloneBuild(board);
  run.day = day;
  run.gold = 0;
  run.nextUid = Math.max(100, ...[...board.items, ...board.mods, ...(board.turrets ?? [])].map((p) => p.uid)) + 1;
  return run;
}

function place(hero: HeroId, seed: number, day: number, def: string, npcDay: boolean) {
  setHullScale(true);
  setLadderFix(true);
  setNpcDay(false);
  const board = playerRun(hero, 10, seed)[day - 1].build;
  setNpcDay(npcDay);
  const run = boardRun(board, hero, day);
  const r = placeFreePart(run, def, new Rng(hashSeed("lastchance-place", hero, run.seed, day)));
  return { board, run, r, gain: rateOn(run.build, day) / rateOn(board, day) - 1 };
}

const pieces = (b: Build): string[] => [...b.items, ...b.mods].map((p) => p.def).sort();

describe("HULL-1d: the bots' REFIT swap of LAST CHANCE's part (NPC_DAY on only)", () => {
  for (const [hero, seed, day, def, kind] of [["foundry", 151, 7, "chamber", "mod"], ["furnace", 58, 7, "platebreaker", "gate"]] as const) {
    it(`${hero} seed ${seed} day ${day}, ${ITEMS[def].name} (${kind}): NPC_DAY off, cargo (as before); on, swapped in for a fitted ${kind === "mod" ? "gear piece" : "rig"} that goes to cargo, with a rating gain`, () => {
      expect(ITEMS[def].kind).toBe(kind);
      const off = place(hero, seed, day, def, false);
      expect(off.r).toEqual({ rel: 0, placed: false });
      expect(off.run.inventory.map((i) => i.def)).toEqual([def]);
      expect(pieces(off.run.build)).toEqual(pieces(off.board));
      const on = place(hero, seed, day, def, true);
      expect(on.r.placed).toBe(true);
      expect(on.r.rel).toBeGreaterThan(0);
      expect(on.gain).toBeCloseTo(on.r.rel, 9);
      // one fitted piece of its kind out to cargo (REFIT sells nothing), the part in: the deck holds as many pieces
      expect(on.run.inventory).toHaveLength(1);
      const out = on.run.inventory[0].def;
      expect(out).not.toBe(def);
      expect(ITEMS[out].kind).toBe(kind);
      expect(pieces(on.run.build)).toEqual([...pieces(on.board).filter((d, i, a) => !(d === out && a.indexOf(d) === i)), def].sort());
      expect(on.run.gold).toBe(0);
    });
  }
});
