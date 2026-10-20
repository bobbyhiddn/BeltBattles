// BUMP-1G B3 (BRIEF-BUMP1G P2; RULING-BUMP1F-R5 R5.2 (2), the cache trap of REPORT-BUMP1F R3.4 (a)): playerRun's cache key (src/sim/harness/player.ts) names every toggle a test can flip that changes a par run.
// Before B3 it named none of EFFECT_FLOOR (withEffectFloor), the rivals' words (withNpcWords), the shrine in the event bag (withShrine) or WAVE3 (withWave3): a run cached in one state was served in the other.
// The check is by behaviour, not by the key's text: for each toggle, a run is cached in the shipped state, then asked for again with the toggle flipped; it must equal a FRESH run of the flipped state
// (playerRun with a no-op onDecide is traced, which bypasses the cache), and the shipped state must still read what a fresh run reads. The toggle must move at least one of the runs it is asked about
// (otherwise the test would prove nothing): EFFECT_FLOOR is searched among the seeds whose wares it changes, the other two among the first seeds of each hero.
import { describe, expect, it } from "vitest";
import { wave3Live, withWave3, type HeroId } from "../src/sim/content";
import { parRunSeed, playerRun, type PlayerDay } from "../src/sim/harness/player";
import { effectFloorRules, withEffectFloor } from "../src/sim/effectFloor";
import { npcWordsRules, withNpcWords } from "../src/sim/npcWords";
import { shrineInBag, withShrine } from "../src/game/shrine";
import { newRun } from "../src/game/run";

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const fresh = (hero: HeroId, seed: number): PlayerDay[] => playerRun(hero, 10, seed, { onDecide: () => {} }); // traced: neither reads nor writes the cache
const sig = (days: PlayerDay[]): string => JSON.stringify(days.map((d) => d.build));

/** For each (hero, seed) of `pairs`: the shipped state's cached run, then the flipped state's cached run, both against fresh runs. Returns how many pairs the toggle moved. */
function audit(flip: <T>(fn: () => T) => T, pairs: [HeroId, number][]): number {
  let moved = 0;
  for (const [hero, seed] of pairs) {
    const shipped = sig(playerRun(hero, 10, seed)); // caches the shipped state
    const other = sig(flip(() => playerRun(hero, 10, seed))); // would be the cached shipped run if the key ignored the toggle
    const otherFresh = sig(flip(() => fresh(hero, seed)));
    expect(other, `${hero} seed ${seed}: the flipped state is served its own run, not the cached one`).toBe(otherFresh);
    expect(sig(playerRun(hero, 10, seed)), `${hero} seed ${seed}: the shipped state still reads its own cached run`).toBe(shipped);
    expect(shipped, `${hero} seed ${seed}: the cached shipped run is the fresh one`).toBe(sig(fresh(hero, seed)));
    if (otherFresh !== shipped) moved++;
  }
  return moved;
}

const firstSeeds = (n: number): [HeroId, number][] => HEROES.flatMap((h) => Array.from({ length: n }, (_, i): [HeroId, number] => [h, i + 1]));

describe("BUMP-1G B3: playerRun's cache key names every toggle that changes a run", () => {
  it("EFFECT_FLOOR: a run cached with the floor on is not served with it off, and the other way round", () => {
    expect(effectFloorRules()).toBe(true); // the shipped state (BUMP-1G F1)
    // the seeds whose wares the floor changes (a swap of one ware, about 1 seed in 20), searched per hero
    const pairs: [HeroId, number][] = [];
    for (const h of HEROES) {
      let got = 0;
      for (let seed = 1; seed <= 200 && got < 2; seed++) {
        const on = JSON.stringify(newRun(h, parRunSeed(h, seed), "b3").wares);
        const off = withEffectFloor(() => JSON.stringify(newRun(h, parRunSeed(h, seed), "b3").wares), false);
        if (on !== off) { pairs.push([h, seed]); got++; }
      }
    }
    expect(pairs.length, "seeds whose wares the floor changes were found").toBeGreaterThanOrEqual(4);
    const moved = audit((fn) => withEffectFloor(fn, false), pairs);
    expect(moved, "the floor moves at least one of these par runs (else this test proves nothing)").toBeGreaterThan(0);
    expect(effectFloorRules()).toBe(true);
  }, 600_000);

  it("the rivals' words (withNpcWords): the same, in the ENCHANT world", () => {
    expect(npcWordsRules()).toBe(true);
    const moved = audit((fn) => withNpcWords(fn, false), firstSeeds(2));
    expect(moved, "the toggle moves at least one of these par runs (else this test proves nothing)").toBeGreaterThan(0);
    expect(npcWordsRules()).toBe(true);
  }, 600_000);

  it("the shrine in the event bag (withShrine): the same, in the ENCHANT world", () => {
    expect(shrineInBag()).toBe(true);
    const moved = audit((fn) => withShrine(fn, false), firstSeeds(2));
    expect(moved, "the toggle moves at least one of these par runs (else this test proves nothing)").toBeGreaterThan(0);
    expect(shrineInBag()).toBe(true);
  }, 600_000);

  it("WAVE3 (withWave3): the same (kit-1g/zz-b3others.test.ts: it moves 8 of 8 par runs; ENDLESS, HEARTS, PICK and FIRST_RUN move none, so they stay out of the key)", () => {
    expect(wave3Live()).toBe(true);
    const moved = audit((fn) => withWave3(fn, false), firstSeeds(1));
    expect(moved, "the toggle moves at least one of these par runs (else this test proves nothing)").toBeGreaterThan(0);
    expect(wave3Live()).toBe(true);
  }, 600_000);
});
