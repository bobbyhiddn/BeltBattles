// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E4; step 4): holding, merging, moving, selling and replacing a word. One per piece; the merged
// piece keeps ONE word (only one copy has one: kept; both: the bots keep the higher-valued, the player picks after the merge; the same
// word twice: GROWING keeps the higher counter); a word stays through move, store, REFIT and install; it is lost on a sale (the price
// is sellValue with nothing added; the sale asks first); a second word replaces it. With ENCHANT off the words are inert.
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS, sellValue } from "../src/sim/content";
import { setTurretList, turretList, turretSlots } from "../src/sim/deck";
import { ENCHANT, mergeWord, replacesText, sameEnchant, sellAskText, setEnchant, withEnchant } from "../src/sim/enchant";
import { gainModule, pickMergedWord, setPieceWord } from "../src/game/fuse";
import { moveInstalled, newRun, installFromCargo, sellInventory, sellInstalled, storePlaced, storeTurret, type Run } from "../src/game/run";
import { pieceAt, sellWarning } from "../src/game/enchanter";

afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);

/** A furnace run on day 3 with 50 G and nothing else but its start; uids from 200 up are ours. */
function fresh(seed = 5): Run {
  const run = newRun("furnace", seed);
  run.day = 3;
  run.gold = 50;
  return run;
}
const deckRig = (run: Run, uid: number, extra: Record<string, unknown> = {}): void => { run.build.items.push({ uid, def: "whetstone", x: 1, y: 5, ...extra }); };
const cargo = (run: Run, uid: number, def: string, extra: Record<string, unknown> = {}): void => { run.inventory.push({ uid, def, ...extra }); };
const rig = (run: Run, uid: number) => run.build.items.find((p) => p.uid === uid)!;

describe("ENCHANT-1 E4: a merge keeps one word", () => {
  it("only the absorbed copy has a word: it moves onto the survivor, and the numbers use the new stars", () => {
    on(() => {
      const run = fresh();
      deckRig(run, 200); // placed ★1, plain
      cargo(run, 201, "whetstone", { stars: 2, ench: "rising" }); // cargo ★2 with a word
      const g = gainModule(run, "whetstone"); // the new ★1 joins 200 (★2), which then meets 201 (★2): ★3
      expect(g.steps.map((s) => s.stars)).toEqual([2, 3]);
      expect(rig(run, 200)).toMatchObject({ stars: 3, ench: "rising" });
      expect(run.inventory.find((i) => i.uid === 201)).toBeUndefined();
      expect(run.enchMerge).toBeUndefined(); // nothing to pick
    });
  });
  it("only the survivor has a word: it is kept", () => {
    on(() => {
      const run = fresh();
      deckRig(run, 200, { ench: "fiery" });
      gainModule(run, "whetstone");
      expect(rig(run, 200)).toMatchObject({ stars: 2, ench: "fiery" });
      expect(run.enchMerge).toBeUndefined();
    });
  });
  it("both have a word: the survivor's stays, and the pick is open; the player's pick swaps it; a stale pick does nothing", () => {
    on(() => {
      const run = fresh();
      deckRig(run, 200, { ench: "fiery" });
      cargo(run, 201, "whetstone", { stars: 2, ench: "rising" });
      gainModule(run, "whetstone");
      expect(rig(run, 200)).toMatchObject({ stars: 3, ench: "fiery" }); // the survivor's own by default
      expect(run.enchMerge).toEqual({ uid: 200, kept: { ench: "fiery" }, lost: { ench: "rising" } });
      expect(pickMergedWord(run, true)).toBe(true);
      expect(rig(run, 200).ench).toBe("rising");
      expect(run.enchMerge).toBeUndefined();
      expect(pickMergedWord(run, true)).toBe(false); // nothing open
    });
    on(() => {
      const run = fresh();
      deckRig(run, 200, { ench: "fiery" });
      cargo(run, 201, "whetstone", { stars: 2, ench: "rising" });
      gainModule(run, "whetstone");
      setPieceWord(run, 200, { ench: "braced" }); // the piece changed since: the pick is moot
      expect(pickMergedWord(run, true)).toBe(false);
      expect(rig(run, 200).ench).toBe("braced");
    });
  });
  it("the bots' chooser keeps the word it values higher, and the pick offers the other", () => {
    on(() => {
      const run = fresh();
      deckRig(run, 200, { ench: "fiery" });
      cargo(run, 201, "whetstone", { stars: 2, ench: "rising" });
      gainModule(run, "whetstone", undefined, 1, { choose: ({ a, b }) => (b.ench === "rising" ? b : a) });
      expect(rig(run, 200)).toMatchObject({ stars: 3, ench: "rising" });
      expect(run.enchMerge).toEqual({ uid: 200, kept: { ench: "rising" }, lost: { ench: "fiery" } });
    });
  });
  it("the same word twice is one word; GROWING keeps the higher counter, WIDE the survivor's side", () => {
    on(() => {
      const run = fresh();
      deckRig(run, 200, { ench: "growing", grow: 2 });
      cargo(run, 201, "whetstone", { stars: 2, ench: "growing", grow: 5 });
      gainModule(run, "whetstone");
      expect(rig(run, 200)).toMatchObject({ stars: 3, ench: "growing", grow: 5 });
      expect(run.enchMerge).toBeUndefined();
      const w = fresh();
      deckRig(w, 200, { ench: "wide", enchDir: 2 });
      cargo(w, 201, "whetstone", { stars: 2, ench: "wide", enchDir: 3 });
      gainModule(w, "whetstone");
      expect(rig(w, 200)).toMatchObject({ stars: 3, ench: "wide", enchDir: 2 });
    });
    expect(mergeWord({ ench: "growing", grow: 7 }, { ench: "growing", grow: 3 }).kept).toEqual({ ench: "growing", grow: 7 });
    expect(mergeWord({}, {}).kept).toEqual({});
    expect(mergeWord({ ench: "fiery", grow: 9 }, undefined).kept).toEqual({ ench: "fiery" }); // a counter belongs to GROWING only
    expect(sameEnchant({ ench: "wide", enchDir: 1 }, { ench: "wide", enchDir: 2 })).toBe(false);
  });
  it("a word on a TURRET survives a merge (the starting copy merges with a bought one) and the chain keeps it to ★3", () => {
    on(() => {
      const run = fresh();
      const t = turretList(run.build)[0];
      setPieceWord(run, t.uid, { ench: "fiery" });
      gainModule(run, t.def); // ★2
      gainModule(run, t.def); // + another ★1: no ★2 twin, so it waits in cargo
      gainModule(run, t.def); // ★1 + ★1 in cargo -> ★2 -> meets the installed ★2: ★3
      const now = turretList(run.build).find((x) => x.uid === t.uid)!;
      expect(now).toMatchObject({ ench: "fiery" });
      expect(now.stars).toBe(3);
      expect(now.free).toBe(true); // the starting copy's flag stays
    });
  });
  it("a chain of two merges with a word each time opens ONE pick, for the final survivor", () => {
    on(() => {
      const run = fresh();
      deckRig(run, 200, { ench: "fiery" }); // ★1
      cargo(run, 201, "whetstone", { stars: 2, ench: "rising" });
      cargo(run, 202, "whetstone", { stars: 3, ench: "braced" }); // ★3 is not merged with anything below it
      gainModule(run, "whetstone"); // 200 -> ★2 (fiery) -> + 201 -> ★3 (fiery, pick fiery/rising)
      expect(rig(run, 200)).toMatchObject({ stars: 3, ench: "fiery" });
      expect(run.enchMerge?.uid).toBe(200);
      expect(run.inventory.find((i) => i.uid === 202)?.ench).toBe("braced");
    });
  });
  it("with ENCHANT off the words are inert in a merge: the survivor's fields are what they were, the other's word is not carried", () => {
    const run = fresh();
    deckRig(run, 200);
    cargo(run, 201, "whetstone", { stars: 2, ench: "rising" });
    gainModule(run, "whetstone");
    expect(rig(run, 200)).toEqual({ uid: 200, def: "whetstone", x: 1, y: 5, stars: 3 });
    expect(run.enchMerge).toBeUndefined();
  });
});

describe("ENCHANT-1 E4: a word stays when the piece moves, is stored or is installed again", () => {
  it("a deck piece to cargo and back keeps its word, side and counter (storePlaced); a turret too (move, store, install)", () => {
    on(() => {
      const run = fresh();
      deckRig(run, 200, { ench: "wide", enchDir: 3 });
      expect(storePlaced(run, 200)).toBe(true);
      expect(run.inventory.find((i) => i.uid === 200)).toEqual({ uid: 200, def: "whetstone", ench: "wide", enchDir: 3 });
      deckRig(run, 201, { ench: "growing", grow: 4 });
      expect(storePlaced(run, 201)).toBe(true);
      expect(run.inventory.find((i) => i.uid === 201)).toEqual({ uid: 201, def: "whetstone", ench: "growing", grow: 4 });
      // turrets
      const t = turretList(run.build)[0];
      setPieceWord(run, t.uid, { ench: "growing", grow: 6 });
      const r = moveInstalled(run, t.slot, 1); // the furnace's second slot is empty: a move
      expect(r.ok).toBe(true);
      expect(turretList(run.build).find((x) => x.uid === t.uid)).toMatchObject({ slot: 1, ench: "growing", grow: 6 });
      expect(storeTurret(run, 1).ok).toBe(true);
      expect(run.inventory.find((i) => i.uid === t.uid)).toMatchObject({ ench: "growing", grow: 6 });
      expect(installFromCargo(run, t.uid, 0).ok).toBe(true);
      expect(turretList(run.build).find((x) => x.uid === t.uid)).toMatchObject({ slot: 0, ench: "growing", grow: 6 });
    });
  });
  it("a swap keeps each turret's own word", () => {
    on(() => {
      const run = newRun("weaver", 5); // three starting DART GUNs
      run.day = 3;
      const list = turretList(run.build);
      expect(list.length).toBeGreaterThan(1);
      setPieceWord(run, list[0].uid, { ench: "fiery" });
      setPieceWord(run, list[1].uid, { ench: "braced" });
      expect(moveInstalled(run, list[0].slot, list[1].slot).ok).toBe(true);
      const after = turretList(run.build);
      expect(after.find((x) => x.uid === list[0].uid)).toMatchObject({ slot: list[1].slot, ench: "fiery" });
      expect(after.find((x) => x.uid === list[1].uid)).toMatchObject({ slot: list[0].slot, ench: "braced" });
    });
  });
  it("losing WIDE on a turret sends the extra gear to cargo, last placed first (the trimGear rule)", () => {
    on(() => {
      const run = fresh();
      const gear = Object.values(ITEMS).filter((d) => d.kind === "mod").slice(0, 2).map((d) => d.id);
      const t = turretList(run.build)[0];
      setPieceWord(run, t.uid, { ench: "wide" });
      const room = turretSlots(run.build)[t.slot].gearSlots;
      expect(room).toBe(turretSlots({ ...run.build, turrets: turretList(run.build).map((x) => ({ ...x, ench: undefined })) })[t.slot].gearSlots + 1);
      run.build.mods.push({ uid: 300, def: gear[0], turret: t.slot }, { uid: 301, def: gear[1], turret: t.slot });
      expect(run.build.mods.filter((m) => m.turret === t.slot).length).toBe(2);
      setPieceWord(run, t.uid, { ench: "fiery" }); // replaced: no extra slot
      expect(run.build.mods.filter((m) => m.turret === t.slot).map((m) => m.uid)).toEqual([300]);
      expect(run.inventory.some((i) => i.uid === 301)).toBe(true);
    });
  });
});

describe("ENCHANT-1 E4: selling loses the word, adds nothing to the price, and asks first", () => {
  it("a cargo piece, a deck piece and a turret sell at sellValue, whatever word they hold", () => {
    on(() => {
      const run = fresh();
      cargo(run, 200, "whetstone", { stars: 2, ench: "fiery" });
      cargo(run, 201, "whetstone", { stars: 3 });
      const plain = sellValue("whetstone", 3);
      const g0 = run.gold;
      expect(sellInventory(run, 200)).toBe(sellValue("whetstone", 2));
      expect(sellInventory(run, 201)).toBe(plain);
      expect(run.gold).toBe(g0 + sellValue("whetstone", 2) + plain);
      expect(run.inventory.some((i) => i.uid === 200)).toBe(false); // the word went with it
      // a deck piece: to cargo, then sold
      deckRig(run, 202, { ench: "echoing" });
      storePlaced(run, 202);
      expect(sellInventory(run, 202)).toBe(sellValue("whetstone", 1));
      // a turret that can be sold (bought: not the free 1-star starting copy): ★2 with a word
      const t = turretList(run.build)[0];
      setTurretList(run.build, turretList(run.build).map((x) => (x.uid === t.uid ? { ...x, stars: 2, ench: "massive" } : x)));
      const before = run.gold;
      const v = sellInstalled(run, t.slot);
      expect(v).toBeGreaterThan(0);
      expect(run.gold).toBe(before + v);
    });
  });
  it("selling asks first: the text names the word (null for a piece without one, or with the switch off)", () => {
    const run = fresh();
    cargo(run, 200, "whetstone", { ench: "fiery" });
    deckRig(run, 201, { ench: "rising" });
    const t = turretList(run.build)[0];
    expect(sellWarning(run, { kind: "cargo", uid: 200 })).toBeNull(); // off: nothing sees it
    on(() => {
      expect(sellWarning(run, { kind: "cargo", uid: 200 })).toBe("SELL? FIERY IS LOST");
      expect(sellWarning(run, { kind: "item", uid: 201 })).toBe(sellAskText("rising"));
      expect(sellWarning(run, { kind: "turret", slot: t.slot })).toBeNull(); // no word
      cargo(run, 202, "whetstone");
      expect(sellWarning(run, { kind: "cargo", uid: 202 })).toBeNull();
      expect(replacesText("fiery")).toBe("REPLACES FIERY");
      expect(pieceAt(run, { kind: "cargo", uid: 200 })).toMatchObject({ def: "whetstone", ench: "fiery" });
    });
  });
});
