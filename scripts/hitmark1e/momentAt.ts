// HITMARK-1E (REQ-BFG-100, C7; BRIEF-HITMARK1E step 6) picture tool, not shipped: tools/scale2c/scaleMoment.ts's pick, moved to a
// clock reading. SCALE-2c's round-M stills were one fight (day 8, FURNACE's par deck 2 with a POWDER KEG, a GRUDGE ROD and a SPALL
// CATCHER swapped in, against WEAVER's par deck 3; the run 4W 6 hearts) at 0:04 and at 0:14. The sim has been retuned since (SCALE-2d,
// 2e), so scaleMoment.ts now ranks that fight's moments differently (its best is past 0:19); the readers saw clock readings and the
// prompt quotes them, so this takes the same fight (top[PICK] of scaleMoment.ts's file) and finds, in the second that starts at
// SECS, the first tick with a reader's pop on your side (a process `add` of dmg, amount at least ADD_MIN: scaleMoment.ts's rule),
// else the tick at SECS + 0.2. It writes a moment file of that one pick, for tools/scale2c/scaleShots.mjs's `moment` argument:
// tick, t, hits on you, keg hits and pop are set from the replay here (the fight is deterministic from its decks and seed).
// Build: npx vite build --ssr scripts/hitmark1e/momentAt.ts --outDir <W>/tmp/hitmark1e-momentAt --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/hitmark1e-momentAt/momentAt.js <scaleMoment.json> <out.json> [secs 14] [pick 0]
import { readFileSync, writeFileSync } from "node:fs";
import { Battle } from "../../src/sim/battle";
import type { Build } from "../../src/sim/deck";
import { heartsLost, withScaleRigs } from "../../src/sim/scale";
import { ADD_MIN } from "../../src/game/counters";
import { setupRun } from "../../src/tooling";
import { battleSeed } from "../../src/game/run";

const [IN, OUT] = [process.argv[2], process.argv[3]];
const SECS = Number(process.argv[4] ?? 14), PICK = Number(process.argv[5] ?? 0);
if (!IN || !OUT) throw new Error("usage: momentAt.js <scaleMoment.json> <out.json> [secs] [pick]");

interface Moment { tick: number; t: number; hits: number; keg: number; pop: { def: string; amount: number } }
interface Pick { day: number; seed: number; run: { hero: string; seed: number; wins: number; lives: number; day: number }; i: number; foe: string; a: Build; b: Build; swaps: string; secs: number; winner: number; moment: Moment }
const pick = (JSON.parse(readFileSync(IN, "utf8")) as { top: Pick[] }).top[PICK];

withScaleRigs(() => {
  const run = setupRun({ hero: pick.run.hero as never, seed: pick.run.seed, wins: pick.run.wins, lives: pick.run.lives, day: pick.run.day });
  const seed = battleSeed(run), lost = heartsLost(run.lives, run);
  if (seed !== pick.seed) console.log(`NOTE: the battle seed now is ${seed}, the pick's file has ${pick.seed}`);
  const bt = new Battle(structuredClone(pick.a), structuredClone(pick.b), seed, [run.wins, 0], pick.run.day, [lost, 0]);
  const keg = bt.sides[0].gates.find((g) => g.def.id === "keg");
  let found: Moment | null = null, fallback: Moment | null = null;
  while (!bt.over && bt.t < SECS + 1 && !found) {
    bt.step();
    const at = (e?: { def: string; add?: { amount: number } }): Moment => ({
      tick: bt.ticks, t: +bt.t.toFixed(3), hits: bt.sides[0].hitsTaken ?? 0, keg: keg?.ownHits ?? 0, pop: { def: e?.def ?? "", amount: e?.add?.amount ?? 0 },
    });
    if (bt.t >= SECS + 0.2 && !fallback) fallback = at();
    for (const e of bt.drainEvents()) {
      if (e.type !== "process" || e.side !== 0 || !e.add || e.add.kind !== "dmg" || e.add.amount < ADD_MIN) continue;
      if (bt.t >= SECS && !found) found = at(e);
    }
  }
  const m = found ?? fallback;
  if (!m) throw new Error(`the fight ended before ${SECS} s`);
  console.log(`pick ${PICK}: day ${pick.day} furnace${pick.i + 1} v ${pick.foe} seed ${seed}; at ${SECS} s: tick ${m.tick} (${m.t} s), hits on you ${m.hits}, keg hits ${m.keg}, pop ${m.pop.def || "none"} +${m.pop.amount} (${found ? "a reader's pop" : "no pop in that second: the tick at SECS + 0.2"})`);
  writeFileSync(OUT, JSON.stringify({ top: [{ ...pick, moment: m }] }, null, 1));
});
