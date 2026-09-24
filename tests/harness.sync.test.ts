// Harness v2 fix pass, group 6 (F6, decision D5; REQ-BFG-019): FOUNDRY twin sync compares speed
// gates by def AND stars, in the trait (patch 0004) and in the mirror lever, where a copy that
// merges is no mirror. Game rules are untouched (the design question is OPEN for the owner).
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { HEROES, ITEMS } from "../src/sim/content";
import { occupancy, routeInfo, routesOf, type Build } from "../src/sim/deck";
import { unfusedPairs, validateBuild } from "../src/net/validate";
import { randomBuild } from "../src/sim/harness/gen";
import { buildTraits } from "../src/sim/harness/levers";
import { isSpeedGate } from "../src/sim/harness/shopper";
import { starsOf } from "../src/sim/stars";

/** v1's star-blind trait: Crucible twins matched and the same speed-gate DEF at every index. */
function syncedByDefOnly(b: Build): boolean {
  const sig = b.items.find((p) => p.def === HEROES[b.hero].factory);
  const own = sig ? routesOf(b, sig.uid) : [];
  if (!(sig && ITEMS[sig.def].factory?.ammo === "blank" && own.length === 2)) return false;
  const [ia, ic] = own.map((ri) => routeInfo(b, ri));
  const occ = occupancy(b);
  const speeds = (ri: number) => b.routes[ri].cells.map((k) => {
    const p = b.items.find((q) => q.uid === occ[k].item);
    return p && isSpeedGate(ITEMS[p.def]) ? p.def : "";
  });
  return ia.turret >= 0 && ia.turret === ic.turret && ia.tiles === ic.tiles && speeds(own[0]).join() === speeds(own[1]).join();
}

/** The speed-gate pairs at the same cell index of the two twin routes. */
function speedPairs(b: Build): [Build["items"][number], Build["items"][number]][] {
  const sig = b.items.find((p) => p.def === HEROES[b.hero].factory)!;
  const [ra, rb] = routesOf(b, sig.uid).map((ri) => b.routes[ri].cells);
  const occ = occupancy(b), at = (k: number) => b.items.find((q) => q.uid === occ[k].item);
  const out: [Build["items"][number], Build["items"][number]][] = [];
  ra.forEach((k, i) => {
    const x = at(k), y = at(rb[i]);
    if (x && y && isSpeedGate(ITEMS[x.def]) && isSpeedGate(ITEMS[y.def])) out.push([x, y]);
  });
  return out;
}

describe("FOUNDRY twin sync with stars (F6)", () => {
  it("buildTraits: a mirrored pair with different stars is not synced; the same def and stars is", () => {
    let b: Build | undefined;
    for (let i = 0; i < 200 && !b; i++) {
      const c = randomBuild("foundry", 5, new Rng(hashSeed("sync-trait", i)), "off");
      if (buildTraits(c, 2).speedSynced) b = c;
    }
    expect(b).toBeDefined();
    const [x, y] = speedPairs(b!)[0];
    expect(buildTraits(b!, 2).synced).toBe(true);
    x.stars = 2;
    expect(buildTraits(b!, 2).synced).toBe(false); // different speeds at the same index
    expect(syncedByDefOnly(b!)).toBe(true); // the old trait called it synced
    y.stars = 2;
    expect(buildTraits(b!, 2).synced).toBe(true);
    x.stars = 3;
    y.stars = 3;
    expect(buildTraits(b!, 2).speedSynced).toBe(true);
  });

  it("stars on, the tournament's FOUNDRY population: no build is synced by def but not by stars, every build stays legal, and twins still sync", () => {
    // at 52d35ee this sample had 138 def-synced builds but only 88 def-and-stars synced (50 asymmetric)
    let synced = 0, asym = 0;
    for (const day of [1, 3, 5, 7, 10]) {
      for (let i = 0; i < 40; i++) {
        const b = randomBuild("foundry", day, new Rng(hashSeed("bb-pop", 1, "foundry", day, i)), "on");
        expect(validateBuild(b, day).errors, `d${day} #${i}`).toEqual([]);
        expect(unfusedPairs(b), `d${day} #${i}`).toEqual([]);
        const t = buildTraits(b, 2);
        if (t.synced) synced++;
        if (syncedByDefOnly(b) && !t.synced) asym++;
        // a synced build's mirrored speed pairs are the same def at the same star (only 3-star can exist)
        if (t.synced) for (const [x, y] of speedPairs(b)) expect([x.def, starsOf(x)]).toEqual([y.def, starsOf(y)]);
      }
    }
    expect(asym).toBe(0);
    expect(synced).toBeGreaterThan(40);
  }, 60_000);

  it("stars off is untouched: synced FOUNDRY builds keep 1-star mirrored speed pairs (v1)", () => {
    let speed = 0;
    for (let i = 0; i < 60; i++) if (buildTraits(randomBuild("foundry", 7, new Rng(hashSeed("sync-off", i)), "off"), 2).speedSynced) speed++;
    expect(speed).toBeGreaterThan(0);
  });
});
