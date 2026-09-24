import { describe, expect, it } from "vitest";
import { BuildScreen } from "../src/screens/build/build";
import { newRun, type Run } from "../src/game/run";
import { gainModule } from "../src/game/fuse";

// 0.6.1r F4 (review-061): the build screen's survivor ring (0.6.1d2) must mark the copy that
// survives what the player is doing with the offer. A tap-buy sends the copy to cargo; a drop on a
// deck cell places it first (gainModule with `at`), and ARSENAL.md §4.1's survivor rule then keeps
// a placed copy over one in cargo, and of two placed twins the one already at that level. The ring
// helper, BuildScreen.survivorUid, runs here on a stub `this`: no DOM, canvas or Game needed.
// Every expectation comes from the model itself (a clone of the run, gained into), never from the
// ring's own logic.

// 0.6.2 BELTSIDE merge: a rig stands beside the belt, never on it (R1), so the twin and the drop take the cells west
// of the FURNACE starting route's tiles (4,2) and (4,1) (where 0.6.1r put them), each facing its tile (rot 1: east)
const TWIN_CELL = { x: 3, y: 2, rot: 1 };
const DROP_CELL = { x: 3, y: 1, rot: 1 };

interface Stub { refit: boolean; caravan: { ready: boolean }; hover: null; sel: unknown; run: Run; ed: { carry: unknown } }

/** The ring's uid with the first offer selected, or (carried) held mid-drag. */
function ring(run: Run, carried: boolean): number | undefined {
  const def = run.shop.wagons[0].offers[0].def;
  const stub: Stub = {
    refit: false, caravan: { ready: true }, hover: null, sel: { kind: "offer", wagon: 0, slot: 0 }, run,
    ed: { carry: carried ? { src: { from: "offer", wagon: 0, slot: 0 }, def, uid: -1 } : null },
  };
  return (BuildScreen.prototype.survivorUid as (this: Stub) => number | undefined).call(stub);
}

/** A run whose first offer is `def`, owning the given copies first (cargo or deck cell each). */
function setup(def: string, owned: ("cargo" | "deck")[]): { run: Run; uids: number[] } {
  const run = newRun("furnace", 4242);
  const uids = owned.map((w) => gainModule(run, def, w === "deck" ? TWIN_CELL : undefined).survivor);
  run.shop.wagons[0].offers[0] = { def, price: 3, sold: false };
  return { run, uids };
}

const clone = (run: Run): Run => JSON.parse(JSON.stringify(run)) as Run;
const tapBuySurvivor = (run: Run, def: string) => gainModule(clone(run), def).survivor;
const dropSurvivor = (run: Run, def: string) => gainModule(clone(run), def, DROP_CELL).survivor;

describe("survivor ring during a carried offer (0.6.1r F4)", () => {
  it("a 1★ twin in cargo: selected, the ring marks it (tap-buy keeps it); carried, no ring (the dropped copy survives)", () => {
    const { run, uids: [twin] } = setup("temper", ["cargo"]);
    expect(tapBuySurvivor(run, "temper")).toBe(twin);
    expect(ring(run, false)).toBe(twin);
    const dropped = dropSurvivor(run, "temper");
    expect(dropped).not.toBe(twin); // the twin is absorbed by the drop
    expect(ring(run, true)).toBeUndefined();
  });

  it("a 1★ twin on the deck: the ring marks it selected and carried, and it survives both", () => {
    const { run, uids: [twin] } = setup("temper", ["deck"]);
    expect(run.build.items.some((p) => p.uid === twin)).toBe(true);
    expect(tapBuySurvivor(run, "temper")).toBe(twin);
    expect(dropSurvivor(run, "temper")).toBe(twin);
    expect(ring(run, false)).toBe(twin);
    expect(ring(run, true)).toBe(twin);
  });

  it("a cargo-only chain (a 2★ and a 1★ in cargo): carried, no ring, because the drop's survivor is the new copy", () => {
    const { run } = setup("temper", ["cargo", "cargo", "cargo"]);
    const stars = run.inventory.filter((i) => i.def === "temper").map((i) => i.stars ?? 1).sort();
    expect(stars).toEqual([1, 2]);
    const owned = new Set(run.inventory.map((i) => i.uid));
    expect(owned.has(dropSurvivor(run, "temper"))).toBe(false);
    expect(ring(run, true)).toBeUndefined();
    expect(ring(run, false)).toBe(tapBuySurvivor(run, "temper"));
  });

  it("a 1★ in cargo and a 2★ on the deck: the chain ends on the deck twin either way, so it stays ringed", () => {
    const { run } = setup("temper", ["deck", "deck", "cargo"]);
    const deck2 = run.build.items.find((p) => p.def === "temper")!;
    expect(deck2.stars).toBe(2);
    expect(tapBuySurvivor(run, "temper")).toBe(deck2.uid);
    expect(dropSurvivor(run, "temper")).toBe(deck2.uid);
    expect(ring(run, false)).toBe(deck2.uid);
    expect(ring(run, true)).toBe(deck2.uid);
  });
});
