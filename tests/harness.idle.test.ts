// BUMP-1F P2 (F3, BUMP-1E REPORT section 11): the par player's `order` lever (src/sim/harness/levers.ts sortRoute) never leaves a rig idle.
// The harness's own invariant is 'a rig is never left idle' (levers.ts header); sortRoute undid a swap only on a fitsTurned failure. One build of
// tests/beltside.merge061rel's P16 (bastion d7 #3, hash seed p16) swapped SPLITTER 105 with ELBOW GUARD 107 and left both idle (aimAt found no
// rotation that reached the other's tile), the splitter idle through every later lever; P16 pinned it as an exact KNOWN_IDLE exception. The fix: a swap
// that idles a rig that worked before is undone too. Proof: (1) that build now leaves no rig idle and the exception is gone from P16; (2) a random
// sweep of 1,800 builds (6 heroes x 10 days x 30, stars on, as the stand-in pool's own harness) shows 0 idle rigs; (3) the lever still does its job
// on a plain pair (a splitter ahead of a flat-bonus rig is still put in order).
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { hitsOfRig, rigHits, stokeHits, type Build } from "../src/sim/deck";
import { ITEMS } from "../src/sim/content";
import { randomBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";

/** The rigs of `b` that do nothing: no arrow on a belt and no factory hit (a STOKER works factories, never belts: the game's own IDLE rule). */
function idleRigs(b: Build): string[] {
  const hits = rigHits(b), stokes = stokeHits(b);
  return b.items.filter((p) => ITEMS[p.def].kind === "gate" && hitsOfRig(b, p.uid, hits).length + stokes.filter((h) => h.uid === p.uid).length === 0).map((p) => `${p.def} ${p.uid}`);
}

describe("BUMP-1F F3: the order lever never leaves a rig idle", () => {
  it("bastion d7 #3 (hash seed p16), the build that left SPLITTER 105 idle, leaves nothing idle now", () => {
    const b = randomBuild("bastion", 7, new Rng(hashSeed("p16", "bastion", 7, 3)), "on");
    expect(idleRigs(b)).toEqual([]);
    expect(b.items.some((p) => p.uid === 105 && p.def === "splitter")).toBe(true); // it is that build: the splitter is there, and it works
    expect(hitsOfRig(b, 105).length).toBeGreaterThan(0);
  });

  it("a random sweep of 1,800 builds (six heroes x ten days x 30, stars on) leaves 0 idle rigs", () => {
    let builds = 0, rigs = 0;
    const idle: string[] = [];
    for (const hero of HARNESS_HEROES) {
      for (let day = 1; day <= 10; day++) {
        for (let i = 0; i < 30; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("bump1f-idle", hero, day, i)), "on");
          builds++;
          rigs += b.items.filter((p) => ITEMS[p.def].kind === "gate").length;
          for (const r of idleRigs(b)) idle.push(`${hero} d${day} #${i}: ${r}`);
        }
      }
    }
    expect(builds).toBe(1800);
    expect(rigs).toBeGreaterThan(3000);
    expect(idle).toEqual([]);
  }, 600_000);
});
