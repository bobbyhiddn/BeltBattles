// RUN-1 T4b (REQ-BFG-059, REQ-BFG-116; R1.5): a widened ghost's W-L on the dusk intro. D6: a long run's thin day widens to the
// nearest EARLIER day, so a day-12 dusk can meet a day-10 ghost. foeTitle (day.ts) read its W-L at the dusk's day (12 - 1 - wins),
// which counts the two days the ghost never played as losses. DuskFoe.record now carries the optional `ghostDay`, the ghost's
// own day, only when it differs from the dusk's, and foeTitle reads the W-L at it. An exact-day pick and every 10-day run are
// exactly as before: no `ghostDay` key (a save and a record stay byte for byte the same), the same title.
// RUN-1 R2.4 (cap's ruling RULING-RUN1-R2): foeTitle reads the ghost's STATED `losses` when its stamp has them. A long run's record
// states its losses (snapshot v3: day - 1 = wins + losses + draws), and a draw is neither a win nor a loss, so the derived L
// (day - 1 - wins) counted every draw as a loss. DuskFoe.record carries `losses` (an optional number, copied from the snapshot where the
// stamp is made: chooseFoe, onlineFoe) and foeTitle prints wins-losses from it when it is a number, else the derived text exactly as
// before: a save without the key, every 10-day ghost and every snapshot without `losses` read as they did, and the stamp gains one key.
import { afterEach, describe, expect, it } from "vitest";
import { setLongRun, withLongRun } from "../src/sim/longRun";
import { chooseFoe, foeTitle, ghostOf, ghostRecord, onlineFoe } from "../src/game/day";
import { loadPool, saveGhost } from "../src/game/ghosts";
import { newRun, type DuskFoe, type Run } from "../src/game/run";
import { migrateRun } from "../src/game/save";
import type { FetchedGhost } from "../src/net/ghostClient";
import { displayName } from "../src/net/names";
import { snap } from "./netHelpers";

afterEach(() => setLongRun(true)); // the shipped value (BUMP-1D: on; was false)

/** A ghost of `day` with `wins` going into its dusk. */
const ghost = (day: number, wins: number, over: Partial<ReturnType<typeof snap>> = {}) =>
  snap({ day, wins, lives: 6, playerId: "p-anna", runId: `ghost-run-${day}`, name: "ANNA", ...over });
/** A run on `day` (long with the switch on at its start, else the 10-day run). */
function runOn(day: number, long: boolean): Run {
  const run = withLongRun(() => newRun("furnace", 4242, `foetitle-${day}-${long}`), long);
  run.day = day;
  run.wins = 4;
  run.lives = 6;
  return run;
}

describe("RUN-1 T4b: foeTitle reads a widened ghost's W-L at the ghost's own day", () => {
  it("a day-12 dusk against a day-10 ghost with 4 wins: 4-5, not 4-7", () => {
    const run = runOn(12, true);
    const foe = chooseFoe(run, [ghost(10, 4)]);
    expect(foe.kind).toBe("ghost");
    expect(foe.day).toBe(12);
    expect(foe.record?.ghostDay).toBe(10);
    expect(foeTitle(foe)).toBe(`${displayName("ANNA", "p-anna")} · 4-5`);
    expect(ghostRecord(10, 4)).toBe("4-5"); // what it is: 4 wins, then 5 of its 9 earlier dusks not won
    expect(ghostRecord(12, 4)).toBe("4-7"); // what the dusk's day gave (the two days it never played)
  });

  it("the same through the online fetch (onlineFoe): a server ghost of day 10 on a day-12 dusk", () => {
    const run = runOn(12, true);
    const g = ghost(10, 4);
    const fetched: FetchedGhost = { id: "g0123456789abc", snapshot: g, source: "server" };
    const foe = onlineFoe(run, fetched);
    expect(foe.record?.ghostDay).toBe(10);
    expect(foeTitle(foe)).toBe(`${displayName("ANNA", "p-anna")} · 4-5`);
    expect(foe.ghostId).toBe("g0123456789abc");
  });

  it("an exact-day pick (a day-12 ghost on a day-12 dusk) has no ghostDay and reads as before", () => {
    const run = runOn(12, true);
    const foe = chooseFoe(run, [ghost(12, 5), ghost(10, 4)]);
    expect(foe.record?.wins).toBe(5); // the day-12 ghost is the pick (its own day first)
    expect("ghostDay" in foe.record!).toBe(false);
    expect(foeTitle(foe)).toBe(`${displayName("ANNA", "p-anna")} · 5-6`);
  });

  it("a 10-day run: no ghostDay key whatever the pick, the record is exactly as before, the title unchanged", () => {
    const run = runOn(5, false);
    const foe = chooseFoe(run, [ghost(5, 3)]);
    expect(foe.record).toEqual({ wins: 3, lives: 6, runId: "ghost-run-5", playerId: "p-anna", createdAt: 1_790_000_000_000, name: "ANNA" });
    expect(Object.keys(foe.record!)).toEqual(["wins", "lives", "runId", "playerId", "createdAt", "name"]);
    expect(foeTitle(foe)).toBe(`${displayName("ANNA", "p-anna")} · 3-1`);
    // the 10-day run never widens: an earlier day's ghost is not served, the stand-in captain comes
    const alone = chooseFoe(runOn(5, false), [ghost(3, 2)]);
    expect(alone.kind).toBe("standin");
    expect(alone.record).toBeUndefined();
  });

  it("a stand-in captain is untouched, and a record without ghostDay (a save from before) reads at the dusk's day", () => {
    const foe: DuskFoe = chooseFoe(runOn(12, true), []);
    expect(foe.kind).toBe("standin");
    expect(foeTitle(foe)).toBe(foe.name);
    const old: Pick<DuskFoe, "kind" | "name" | "day" | "record"> = {
      kind: "ghost", name: "GHOST", day: 8, record: { wins: 3, lives: 6, runId: "r", playerId: "p-anna", createdAt: 0, name: "ANNA" },
    };
    expect(foeTitle(old)).toBe(`${displayName("ANNA", "p-anna")} · 3-4`);
  });

  it("the field survives a save and a load (a long run's day-12 dusk stored with a day-10 ghost)", () => {
    const run = runOn(12, true);
    run.dusk = chooseFoe(run, [ghost(10, 4)]);
    run.stage = "battle";
    const back = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(back.dusk?.record?.ghostDay).toBe(10);
    expect(back.dusk && foeTitle(back.dusk)).toBe(`${displayName("ANNA", "p-anna")} · 4-5`);
    // and a 10-day run's saved dusk has no such key
    const ten = runOn(5, false);
    ten.dusk = chooseFoe(ten, [ghost(5, 3)]);
    const tenBack = migrateRun(JSON.parse(JSON.stringify(ten)))!;
    expect(tenBack.dusk?.record && "ghostDay" in tenBack.dusk.record).toBe(false);
  });
});

const ANNA = displayName("ANNA", "p-anna");
const KEYS = ["wins", "lives", "runId", "playerId", "createdAt", "name"]; // a named ghost's stamp as it was before R2.4
/** A Storage-shaped memory store (ghosts.ts' Store: getItem and setItem) for the pool. */
function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("RUN-1 R2.4: foeTitle reads the ghost's STATED losses", () => {
  it("a draw-heavy record: a day-8 ghost with 3 wins and 1 loss (3 draws) reads 3-1, not the derived 3-4", () => {
    const run = runOn(8, true);
    const foe = chooseFoe(run, [ghost(8, 3, { losses: 1 })]);
    expect(foe.kind).toBe("ghost");
    expect(foe.record?.losses).toBe(1);
    expect("ghostDay" in foe.record!).toBe(false); // an exact-day pick
    expect(foeTitle(foe)).toBe(`${ANNA} · 3-1`);
    expect(ghostRecord(8, 3)).toBe("3-4"); // what the derived text said: the three draws counted as losses
    expect(`VS ${foeTitle(foe)}`).toBe(`VS ${ANNA} · 3-1`);
    // the same ghost whose snapshot states nothing keeps the derived text
    expect(foeTitle(chooseFoe(run, [ghost(8, 3)]))).toBe(`${ANNA} · 3-4`);
  });

  it("a stated 0 is a number: a day-6 ghost with 1 win, no loss and 4 draws keeps `losses: 0` and reads 1-0, not 1-4", () => {
    const foe = chooseFoe(runOn(6, true), [ghost(6, 1, { losses: 0 })]);
    expect("losses" in foe.record!).toBe(true);
    expect(foe.record?.losses).toBe(0);
    expect(foeTitle(foe)).toBe(`${ANNA} · 1-0`);
    expect(ghostRecord(6, 1)).toBe("1-4");
  });

  it("every split of a ghost's dusks into wins, losses and draws reads wins-losses; only a draw-free split equals the derived text", () => {
    const run = runOn(14, true);
    let splits = 0, drawFree = 0;
    for (let day = 1; day <= 14; day++) {
      run.day = day; // chooseFoe reads the run's day, runId, wins, lives, seed and mark: one run serves every day
      for (let wins = 0; wins <= Math.min(day - 1, 9); wins++) {
        for (let losses = 0; losses <= day - 1 - wins; losses++) {
          const foe = chooseFoe(run, [ghost(day, wins, { losses })]);
          expect(foeTitle(foe), `day ${day}: ${wins} wins, ${losses} losses`).toBe(`${ANNA} · ${wins}-${losses}`);
          const derived = foeTitle(chooseFoe(run, [ghost(day, wins)]));
          expect(derived === foeTitle(foe), `day ${day}: ${wins} wins, ${losses} losses`).toBe(day - 1 - wins === losses);
          splits++;
          if (day - 1 - wins === losses) drawFree++;
        }
      }
    }
    expect(splits).toBeGreaterThan(300); // not an empty loop
    expect(drawFree).toBeLessThan(splits); // and most splits hold draws
  });

  it("the same through the online fetch (onlineFoe): a server ghost that states its losses, and one that does not", () => {
    const run = runOn(8, true);
    const told: FetchedGhost = { id: "g0123456789abc", snapshot: ghost(8, 3, { losses: 1 }), source: "server" };
    const foe = onlineFoe(run, told);
    expect(foe.record?.losses).toBe(1);
    expect(foe.ghostId).toBe("g0123456789abc");
    expect(foeTitle(foe)).toBe(`${ANNA} · 3-1`);
    const plain = onlineFoe(run, { ...told, snapshot: ghost(8, 3) });
    expect("losses" in plain.record!).toBe(false);
    expect(foeTitle(plain)).toBe(`${ANNA} · 3-4`);
  });

  it("a widened ghost with stated losses: a day-12 dusk against a day-10 ghost of 4 wins and 3 losses (2 draws) reads 4-3, not 4-5 or 4-7", () => {
    const run = runOn(12, true);
    const foe = chooseFoe(run, [ghost(10, 4, { losses: 3 })]);
    expect([foe.day, foe.record?.ghostDay, foe.record?.losses]).toEqual([12, 10, 3]);
    expect(foeTitle(foe)).toBe(`${ANNA} · 4-3`);
    expect(ghostRecord(10, 4)).toBe("4-5"); // the derived text at the ghost's own day (R1.5, T4b)
    expect(ghostRecord(12, 4)).toBe("4-7"); // at the dusk's day
    const online = onlineFoe(run, { id: "g0123456789abc", snapshot: ghost(10, 4, { losses: 3 }), source: "server" });
    expect([online.record?.ghostDay, online.record?.losses]).toEqual([10, 3]);
    expect(foeTitle(online)).toBe(`${ANNA} · 4-3`);
    // and an exact-day pick (a day-12 ghost on the day-12 dusk) states its own count, with no ghostDay
    const exact = chooseFoe(run, [ghost(12, 4, { losses: 3 })]);
    expect("ghostDay" in exact.record!).toBe(false);
    expect(foeTitle(exact)).toBe(`${ANNA} · 4-3`);
  });

  it("no `losses` in the snapshot: no key in the stamp and the old text, on a long run, widened, on a 10-day run and online", () => {
    const long = chooseFoe(runOn(12, true), [ghost(12, 5)]);
    expect(Object.keys(long.record!)).toEqual(KEYS);
    expect(foeTitle(long)).toBe(`${ANNA} · 5-6`);
    const wide = chooseFoe(runOn(12, true), [ghost(10, 4)]);
    expect(Object.keys(wide.record!)).toEqual([...KEYS, "ghostDay"]);
    expect(foeTitle(wide)).toBe(`${ANNA} · 4-5`);
    const ten = chooseFoe(runOn(5, false), [ghost(5, 3)]);
    expect(Object.keys(ten.record!)).toEqual(KEYS);
    expect(foeTitle(ten)).toBe(`${ANNA} · 3-1`);
    const online = onlineFoe(runOn(5, false), { id: "g0123456789abc", snapshot: ghost(5, 3), source: "server" });
    expect(Object.keys(online.record!)).toEqual(KEYS);
    expect(foeTitle(online)).toBe(`${ANNA} · 3-1`);
  });

  it("the stamp gains exactly one optional key, last, and every other value is the same", () => {
    const run = runOn(12, true);
    const plain = chooseFoe(run, [ghost(10, 4)]).record!;
    const told = chooseFoe(run, [ghost(10, 4, { losses: 3 })]).record!;
    expect(Object.keys(told)).toEqual([...Object.keys(plain), "losses"]);
    const { losses, ...rest } = told;
    expect(losses).toBe(3);
    expect(rest).toEqual(plain);
    // a ghost without a name (a seed ghost): the key follows the five
    const nameless = chooseFoe(run, [ghost(12, 2, { name: undefined, losses: 5 })]);
    expect(Object.keys(nameless.record!)).toEqual(["wins", "lives", "runId", "playerId", "createdAt", "losses"]);
    expect(foeTitle(nameless)).toBe("WANDERER · 2-5");
    // a 10-day run in progress that meets a long run's ghost of its own day reads what that ghost states
    const ten = chooseFoe(runOn(5, false), [ghost(5, 3, { losses: 0 })]);
    expect(Object.keys(ten.record!)).toEqual([...KEYS, "losses"]);
    expect(foeTitle(ten)).toBe(`${ANNA} · 3-0`);
  });

  it("a `losses` that is not a number (a JSON null, a hand-edited save) is ignored: the derived text, as before", () => {
    const foe = chooseFoe(runOn(12, true), [ghost(10, 4, { losses: 3 })]);
    for (const junk of [null, undefined, "3", {}, [3], true]) {
      const edited = { ...foe, record: { ...foe.record!, losses: junk as unknown as number } };
      expect(foeTitle(edited), String(junk)).toBe(`${ANNA} · 4-5`);
    }
    expect(foeTitle(foe)).toBe(`${ANNA} · 4-3`);
  });

  it("the field survives a save and a load; a save without it still loads and reads the derived text", () => {
    const run = runOn(12, true);
    const stored = chooseFoe(run, [ghost(10, 4, { losses: 3 })]);
    run.dusk = stored;
    run.stage = "battle";
    const text = JSON.stringify(run);
    const back = migrateRun(JSON.parse(text))!;
    expect(back.dusk?.record).toEqual(stored.record);
    expect(JSON.stringify(back.dusk?.record)).toBe(JSON.stringify(stored.record)); // the same keys in the same order
    expect(Object.keys(back.dusk!.record!)).toEqual([...KEYS, "ghostDay", "losses"]);
    expect(foeTitle(back.dusk!)).toBe(`${ANNA} · 4-3`);
    // a stated 0 survives too (it is not dropped as empty)
    const zero = runOn(6, true);
    zero.dusk = chooseFoe(zero, [ghost(6, 1, { losses: 0 })]);
    const zeroBack = migrateRun(JSON.parse(JSON.stringify(zero)))!;
    expect(zeroBack.dusk?.record?.losses).toBe(0);
    expect(foeTitle(zeroBack.dusk!)).toBe(`${ANNA} · 1-0`);
    // an old save has no such key: it loads, and its title is the derived one at the ghost's day
    const old = JSON.parse(text) as { dusk: { record: Record<string, unknown> } };
    delete old.dusk.record.losses;
    const oldBack = migrateRun(old)!;
    expect(oldBack.dusk?.record && "losses" in oldBack.dusk.record).toBe(false);
    expect(foeTitle(oldBack.dusk!)).toBe(`${ANNA} · 4-5`);
    // a save whose key is junk keeps loading (migrateRun does not rewrite the stamp) and reads as an old one
    const junk = JSON.parse(text) as { dusk: { record: Record<string, unknown> } };
    junk.dusk.record.losses = null;
    expect(foeTitle(migrateRun(junk)!.dusk!)).toBe(`${ANNA} · 4-5`);
    // and a 10-day run's saved dusk has no such key
    const ten = runOn(5, false);
    ten.dusk = chooseFoe(ten, [ghost(5, 3)]);
    const tenBack = migrateRun(JSON.parse(JSON.stringify(ten)))!;
    expect(tenBack.dusk?.record && "losses" in tenBack.dusk.record).toBe(false);
  });

  it("what a long run's own snapshot states travels: ghostOf, the pool's own check (saveGhost, loadPool), chooseFoe, the title", () => {
    withLongRun(() => {
      const theirs = newRun("weaver", 77, "their-run"); // a long run (the mark newRun takes while the switch is on)
      theirs.day = 8;
      theirs.wins = 3;
      theirs.losses = 1; // 7 dusks gone: 3 wins, 1 loss, 3 draws
      theirs.lives = 6;
      const g = ghostOf(theirs, 1_790_000_000_000, "p-anna", "ANNA");
      expect(g.losses).toBe(1); // day.ts ghostOf: a long run's snapshot states its losses
      const store = mem();
      saveGhost(g, store);
      const pool = loadPool(store);
      expect(pool).toHaveLength(1); // isSnapshot takes the long run's `losses` (0..day - 1 - wins)
      expect(pool[0].losses).toBe(1);
      const mine = runOn(8, true);
      mine.wins = 3;
      const foe = chooseFoe(mine, pool);
      expect(foe.kind).toBe("ghost");
      expect(foe.record?.losses).toBe(1);
      expect(foeTitle(foe)).toBe(`${ANNA} · 3-1`); // the derived text would read 3-4
      expect(ghostRecord(8, 3)).toBe("3-4");
    });
    // a 10-day run's snapshot states nothing, so its ghost reads the derived text
    const ten = withLongRun(() => newRun("weaver", 78, "their-ten-run"), false);
    ten.day = 8;
    ten.wins = 3;
    ten.losses = 1;
    ten.lives = 3;
    const h = ghostOf(ten, 1_790_000_000_000, "p-anna", "ANNA");
    expect("losses" in h).toBe(false);
    const store = mem();
    saveGhost(h, store);
    const foe = withLongRun(() => chooseFoe(runOn(8, false), loadPool(store)), false);
    expect(foe.kind).toBe("ghost");
    expect(Object.keys(foe.record!)).toEqual(KEYS);
    expect(foeTitle(foe)).toBe(`${ANNA} · 3-4`);
  });
});
