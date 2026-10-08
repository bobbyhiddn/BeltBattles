// NPC-1 (REQ-BFG-077): a scripted three-day run through the road's rules (no screen), for the switch-off pin in
// tests/npc1.day.test.ts. It calls only what npc1-base (236ac6f) already had, so the same script run there gives the
// digest the test pins: with NPC_DAY off the day reads the same as 0.9.7's.
import { hashSeed } from "../src/core/rng";
import type { SideStats } from "../src/sim/battle";
import { choicesFor, pickChoice } from "../src/game/events";
import { finishDay, ghostOf } from "../src/game/day";
import { finishWarlord, leaveCaravan, pickRoad, takePart } from "../src/game/road";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { migrateRun } from "../src/game/save";

const Z: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };

const reload = (run: Run): Run => migrateRun(JSON.parse(JSON.stringify(run)))!;

/** Day 1: a Hard win and its part pick; day 2: the road event (the first open choice); day 3: an Easy loss. A save and
 *  load after every step. Returns everything the rules said, the snapshots and the final run. */
export function scriptedDays(seed = 9701): unknown[] {
  let run = newRun("furnace", seed, "npc1-script");
  const out: unknown[] = [];
  const dawn = () => {
    const o = pendingRune(run);
    if (o) out.push(takeRune(run, o.ids[0]));
    run = reload(run);
  };
  dawn();
  out.push(leaveCaravan(run), pickRoad(run, "hard"));
  run = reload(run);
  out.push(finishWarlord(run, 0, 21.5), takePart(run, 0));
  run = reload(run);
  out.push(leaveCaravan(run), ghostOf(run, 1000, "p-npc1", null));
  out.push(finishDay(run, 0, 30, { ...Z }, { ...Z }));
  dawn();
  out.push(leaveCaravan(run), pickRoad(run, "event"));
  run = reload(run);
  const i = choicesFor(run).findIndex((c) => !c.blocked);
  out.push(i, pickChoice(run, i));
  run = reload(run);
  out.push(leaveCaravan(run), ghostOf(run, 2000, "p-npc1", null));
  out.push(finishDay(run, 1, 30, { ...Z }, { ...Z }));
  dawn();
  out.push(leaveCaravan(run), pickRoad(run, "easy"));
  out.push(finishWarlord(run, 1, 15), leaveCaravan(run), ghostOf(run, 3000, "p-npc1", null));
  out.push(finishDay(run, -1, 30, { ...Z }, { ...Z }));
  out.push(run);
  return out;
}

/** The script's digest: hashSeed over its JSON (and the JSON's length). */
export function scriptDigest(seed = 9701): string {
  const s = JSON.stringify(scriptedDays(seed));
  return `${hashSeed(s).toString(16)}:${s.length}`;
}
