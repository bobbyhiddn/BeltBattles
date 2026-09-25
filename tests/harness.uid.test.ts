// Harness v2 fix pass, group 7 (F13; REQ-BFG-019): with stars on, topUp's fresh Shopper continues
// the deck's uid sequence, so a topped-up build never holds a uid twice. Stars off keeps v1's
// restart at uid 100 (a duplicate included), so v1's output reproduces exactly (see the F11 pin
// in tests/harness.merge.test.ts).
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { ITEMS } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { fullPurseBuild, randomBuild, spendFloor, topUp, type Stars } from "../src/sim/harness/gen";
import { starsOf } from "../src/sim/stars";

const uids = (b: Build) => [...b.items, ...b.mods].map((p) => p.uid);

/** A deck topUp has to finish with a 3-gold gate: a random build that left 0-1 gold, minus one of
 *  its 1-star 3-gold gates (not uid 100), so 3-4 gold and a free belt tile remain. */
function primed(hero: "furnace" | "weaver" | "foundry", day: number, i: number, stars: Stars): { b: Build; rng: Rng } | null {
  const rng = new Rng(hashSeed("uid-prime", hero, day, i, stars));
  const b = randomBuild(hero, day, rng, stars);
  const left = maxGoldByDay(day) - buildCost(b).total;
  const g = b.items.find((p) => ITEMS[p.def].kind === "gate" && ITEMS[p.def].price === 3 && starsOf(p) === 1 && p.uid !== 100);
  if (left > 1 || !g || !uids(b).includes(100)) return null;
  b.items = b.items.filter((p) => p !== g);
  return { b, rng };
}

describe("topUp uids (F13)", () => {
  it("stars on: a topped-up build has unique uids, and a gate topUp adds takes the deck's max uid + 1", () => {
    let placed = 0;
    for (const hero of ["furnace", "weaver", "foundry"] as const) {
      for (const day of [3, 6, 9]) {
        for (let i = 0; i < 25; i++) {
          const p = primed(hero, day, i, "on");
          if (!p) continue;
          const before = uids(p.b), max = Math.max(...before);
          topUp(p.b, day, p.rng, spendFloor(day), "on");
          const after = uids(p.b);
          expect(new Set(after).size, `${hero} d${day} #${i}`).toBe(after.length);
          const fresh = after.filter((u) => !before.includes(u));
          if (fresh.length) {
            placed++;
            expect(fresh).toEqual([max + 1]);
          }
          expect(validateBuild(p.b, day).errors.filter((e) => e.includes("used twice"))).toEqual([]);
        }
      }
    }
    expect(placed).toBeGreaterThan(0); // topUp really placed gates in this sample
  }, 60_000);

  it("stars on: full-purse builds never hold a uid twice", () => {
    for (const hero of ["furnace", "weaver"] as const) {
      for (let day = 1; day <= 10; day++) {
        for (let i = 0; i < 6; i++) {
          const b = fullPurseBuild(hero, day, hashSeed("uid-fp", hero, day, i), spendFloor(day), 60, "on").build;
          expect(new Set(uids(b)).size, `${hero} d${day} #${i}`).toBe(uids(b).length);
        }
      }
    }
  }, 60_000);

  it("stars off keeps v1's restart at uid 100 (the duplicate included)", () => {
    let placed = 0;
    for (const hero of ["furnace", "weaver", "foundry"] as const) {
      for (const day of [3, 6, 9]) {
        for (let i = 0; i < 25; i++) {
          const p = primed(hero, day, i, "off");
          if (!p) continue;
          const n = p.b.items.length;
          topUp(p.b, day, p.rng, spendFloor(day), "off");
          const fresh = p.b.items.slice(n).map((q) => q.uid); // the gate topUp pushed (a raw v1 push)
          if (fresh.length) {
            placed++;
            expect(fresh).toEqual([100]); // v1: the fresh Shopper's first uid, already on the deck
            expect(validateBuild(p.b, day).errors).toContain("item: uid 100 is used twice");
          }
        }
      }
    }
    expect(placed).toBeGreaterThan(0);
  }, 60_000);
});
