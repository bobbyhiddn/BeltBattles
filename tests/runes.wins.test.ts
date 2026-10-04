// RUNES-087F (REQ-BFG-058, cap's Q5): WARLORD'S DUE's wins come from authoritative state only. The dusk (screens/battle.ts)
// passes [run.wins, the ghost snapshot's wins (DuskFoe.record; 0 for a stand-in or a warlord)]; the battle record keeps
// them only when a side holds the rune (net/replay.ts battleRecordFor); the server reads no battle record. A replay
// (game/replays.ts openReplay, from the run summary) checks the record's wins against the run's own record: the player's
// exactly the wins carried into that dusk, the foe's within its snapshot's bound (0..day - 1), 0 for a stand-in.
import { describe, expect, it } from "vitest";
import { cloneBuild, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { battleRecordFor } from "../src/net/replay";
import { openReplay, replayAt, REPLAY_BROKEN } from "../src/game/replays";
import { chooseFoe, onlineFoe } from "../src/game/day";
import { newRun, type DayResult } from "../src/game/run";
import { generateSamplePool } from "../tools/samplePool";

const W = (b: Build, ...ids: string[]): Build => ({ ...cloneBuild(b), runes: [...(b.runes ?? []), ...ids.map((id) => ({ id }))] });
const due = W(heroStartBuild("furnace"), "warlords_due"), foe = heroStartBuild("weaver");
const dusk = (day: number, outcome: DayResult["outcome"], ghost = true) => ({ day, outcome, ghost });

describe("RUNES-087F: WARLORD'S DUE's wins (cap's Q5)", () => {
  it("a ghost's wins are its snapshot's record (the local pool and an online ghost alike); a stand-in has none", () => {
    const pool = generateSamplePool().filter((s) => s.day === 6);
    const run = newRun("weaver", 4242);
    run.day = 6;
    run.wins = 5; // so the match may serve a ghost that carries wins (never a better record than the run's)
    const local = chooseFoe(run, pool);
    expect(local.kind).toBe("ghost");
    const g = pool.find((s) => s.runId === local.record!.runId && s.day === 6)!;
    expect(local.record!.wins).toBe(g.wins);
    const online = onlineFoe(run, { source: "server", id: "x", snapshot: g } as never);
    expect([online.kind, online.record?.wins]).toEqual(["ghost", g.wins]);
    expect(onlineFoe(run, { source: "fallback", error: "no ghost" } as never).record).toBeUndefined();
  });

  it("the run's record at a dusk: its day, the wins carried into it, a ghost or not", () => {
    const h = [dusk(1, "win"), dusk(2, "loss"), dusk(3, "win"), dusk(4, "draw"), dusk(5, "win", false)];
    expect(replayAt(h, 0)).toEqual({ day: 1, wins: 0, ghost: true });
    expect(replayAt(h, 3)).toEqual({ day: 4, wins: 2, ghost: true });
    expect(replayAt(h, 4)).toEqual({ day: 5, wins: 2, ghost: false });
  });

  it("a replay refuses a record whose wins are not the run's record; a record without wins replays as before", () => {
    const at = { day: 5, wins: 2, ghost: true };
    expect(openReplay(battleRecordFor(due, foe, 7, [2, 4]), at).ok).toBe(true);
    expect(openReplay(battleRecordFor(due, foe, 7, [3, 4]), at)).toEqual({ ok: false, why: REPLAY_BROKEN }); // not the 2 carried in
    expect(openReplay(battleRecordFor(due, foe, 7, [2, 5]), at)).toEqual({ ok: false, why: REPLAY_BROKEN }); // a day-5 ghost: 0..4
    expect(openReplay(battleRecordFor(due, foe, 7, [2, 1]), { ...at, ghost: false }).ok).toBe(false); // a stand-in fights with 0
    expect(openReplay(battleRecordFor(due, foe, 7, [2, 0]), { ...at, ghost: false }).ok).toBe(true);
    // nobody holds the rune: the record keeps no wins, so there is nothing to check
    expect(openReplay(battleRecordFor(heroStartBuild("furnace"), foe, 7, [9, 9]), at).ok).toBe(true);
    // without the run's record (another caller), the shape check only, as before
    expect(openReplay(battleRecordFor(due, foe, 7, [3, 4])).ok).toBe(true);
  });
});
