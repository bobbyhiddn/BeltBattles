// RUN-1 T4b (REQ-BFG-059, REQ-BFG-116; R1.5): a widened ghost's W-L on the dusk intro. D6: a long run's thin day widens to the
// nearest EARLIER day, so a day-12 dusk can meet a day-10 ghost. foeTitle (day.ts) read its W-L at the dusk's day (12 - 1 - wins),
// which counts the two days the ghost never played as losses. DuskFoe.record now carries the optional `ghostDay`, the ghost's
// own day, only when it differs from the dusk's, and foeTitle reads the W-L at it. An exact-day pick and every 10-day run are
// exactly as before: no `ghostDay` key (a save and a record stay byte for byte the same), the same title.
import { afterEach, describe, expect, it } from "vitest";
import { setLongRun, withLongRun } from "../src/sim/longRun";
import { chooseFoe, foeTitle, ghostRecord, onlineFoe } from "../src/game/day";
import { newRun, type DuskFoe, type Run } from "../src/game/run";
import { migrateRun } from "../src/game/save";
import type { FetchedGhost } from "../src/net/ghostClient";
import { displayName } from "../src/net/names";
import { snap } from "./netHelpers";

afterEach(() => setLongRun(false));

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
