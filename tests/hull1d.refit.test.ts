// HULL-1d (REQ-BFG-073; BRIEF-HULL1D 2 (a)2 and (e)2): the bots' REFIT swap of LAST CHANCE's part. With NPC_DAY on, a
// player gets REFIT before every dusk and can swap a cargo part in for a fitted piece of its kind (the old one to cargo).
// The bots' own swaps judged a fitted piece against the offer's price, 0 for a free part, so they never swapped it in.
// player.ts placeFreePart now tries refitSwap with NPC_DAY on, when no free spot rates a gain. Two states of HULL-1c's
// all-on LAST CHANCE bench (kit-hull1d/probes/lcpart.ts): a gear piece on a deck with every gear slot taken, and a rig on
// a deck where no free cell rates a gain. HULL_SCALE and LADDER_FIX on (as the bench); NPC_DAY on and off (each through
// its own setter, all put back after each test).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashSeed, Rng } from "../src/core/rng";
import { ITEMS, type HeroId } from "../src/sim/content";
import { cloneBuild, type Build } from "../src/sim/deck";
import { placeFreePart, playerRun, rateOn } from "../src/sim/harness/player";
import { setHullScale } from "../src/sim/hullScale";
import { setLadderFix } from "../src/sim/ladderFix";
import { setNpcDay } from "../src/sim/npcDay";
import { SHAPES, setShapes } from "../src/sim/shapes"; // SHAPES-1 flip: the bench's states with SHAPES off
import { SCALE_RIGS, scaleRules, setScaleRigs } from "../src/sim/scale"; // BUMP-1E: and with the scaling rules off (the seven new rigs out of the shop)
import { withPlainRigs } from "../src/sim/plainRigs"; // BUMP-1D: the bench's boards, the plain rigs out
import { withShapes2 } from "../src/sim/shapes2"; // BUMP-1D: the bench's boards, the six more shaped rigs out
import { withFreeJoins } from "../src/sim/freeJoins"; // HULL-ON (the flip, FREE_JOINS): the bench's boards, joins limited
import { withOpenRunes } from "../src/sim/openRunes"; // HULL-ON (the flip, OPEN_RUNES): the bench's boards, weighted runes
import { newRun, type Run } from "../src/game/run";

// SHAPES-1 flip (step 8): the two states are HULL-1c's bench's, found with SHAPES off (their point is the REFIT swap, not a
// shape); with SHAPES on the par player buys shaped pieces, so seed 151's and seed 58's day-7 boards are other decks, where
// no swap rates a gain. So each test runs with SHAPES off, put back after
// BUMP-1E: and with the scaling rules off (the switch ships on in bb-0.12.0): the par player shops the seven new rigs now (CINDER MAIL, ROT GAUGE, LEECH COIL,
// CROWD PRESS, AEGIS SPIKE, GRUDGE ROD, TROPHY CHAIN), so FOUNDRY 151's day-7 board is another deck, on which no swap rates a gain (placed false in the whole-suite
// run at eb6f751; FURNACE 58's test held there). The bench's states are the world before the seven, as before the twelve (BUMP-1D, below): the scaling switch is the OUTERMOST
// of every nest (off first in beforeEach, back last in afterEach: the seven are the last keys of ITEMS while it is on, so turning SHAPES off and back with the
// scaling switch left on would put them behind the shaped rigs for the rest of the worker, and every seeded draw after it differs)
beforeEach(() => {
  setScaleRigs(false); // BUMP-1E: first
  setShapes(false);
});
afterEach(() => { // the shipped values (AZ-BUMP's flip; were false); place() sets every switch itself
  setNpcDay(true);
  setHullScale(true);
  setLadderFix(true);
  setShapes(SHAPES); // SHAPES-1 flip: the shipped value
  setScaleRigs(SCALE_RIGS); // BUMP-1E: the shipped value (on), last
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
  // HULL-ON (the flip, FREE_JOINS, OPEN_RUNES): the boards are HULL-1c's bench states, measured before both. With FREE_JOINS
  // on the par player plans joins with no limit, and with OPEN_RUNES on it takes its dawn runes from the open pool, so its
  // day-7 decks are other decks: FOUNDRY 151's has 9 pieces (GREASE and a MEND PRESS, no SHOT TOWER; was 8), on which no
  // swap rates a gain (placed false). Proved one switch at a time: FREE_JOINS off alone gives a 7-piece deck with a free
  // gear slot (the part placed with NPC_DAY off too), GUARD, OPEN_RUNES, HEARTS or PICK off alone the 9-piece one; FREE_JOINS
  // and OPEN_RUNES off give the bench's 8 (both cases green). So the board is built with both off; the placement plays the
  // shipped world
  // BUMP-1D (PLAIN_RIGS and SHAPES2 on): the six plain rigs and the six more shaped rigs are in the catalogue now, so the par player's
  // day-7 decks of these two seeds are other decks, on which no swap rates a gain. Proved one switch at a time: SHAPES2 off alone restores
  // FOUNDRY 151's board (green), but FURNACE 58's needs PLAIN_RIGS off as well (each off alone: red). So the board is built with both
  // off too, as the bench had it; the placement plays the shipped world
  const board = withPlainRigs(() => withShapes2(() => withFreeJoins(() => withOpenRunes(() => playerRun(hero, 10, seed)[day - 1].build, false), false), false), false);
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

  it("BUMP-1E: the scaling rules ship on (bb-0.12.0); the bench's states above are read with them off, in the world before the seven new rigs", () => {
    expect(SCALE_RIGS).toBe(true);
    expect(scaleRules()).toBe(false); // beforeEach: this file's world
    expect(ITEMS.cindermail).toBeUndefined();
  });
});
