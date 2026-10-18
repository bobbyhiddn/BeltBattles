// SCALE-2c (REQ-BFG-100 C7-C9 and C11, REQ-BFG-098; BRIEF-SCALE2c section 8 (2)) tooling, not shipped: picks the stills'
// live dusk with SCALE_RIGS on. No field deck holds the new pieces (the bots don't buy them yet: SCALE-2d), so YOUR deck is a
// FURNACE par deck of the day (sim/harness/par.ts parRefs) with three swaps that keep every cell and arrow: its first rare
// 1-cell rig (II) becomes a POWDER KEG (rare, II), its first common 1-cell rig (I) a GRUDGE ROD (common, I), and its first
// piece of turret gear a SPALL CATCHER (gear for gear). The foe: each other hero's par decks of the day. The run: day `d`,
// 4 wins, 6 hearts of 10 (4 lost), so GRUDGE ROD reads 4 and C9 writes `4W 6♥`. The fight is the battle screen's own
// (screens/battle.ts: Arena(run.build, foe.build, battleSeed(run), ..., [run.wins, 0], run.day, [heartsLost, 0]) for a
// stored stand-in foe), so the shots script replays it exactly on the live screen. The moment (8-20 s): hits on you >= 3
// (C7), the keg's own hits >= 4 (its C8 badge +15 and up), and a reader pop on your side (a process `add` >= ADD_MIN: C11),
// the most hits taken first.
// Build: npx vite build --ssr tools/scale2c/scaleMoment.ts --outDir <W>/tmp/s2cpick --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/s2cpick/scaleMoment.js <out.json>
import { writeFileSync } from "node:fs";
import { Battle } from "../../src/sim/battle";
import { ITEMS, type HeroId } from "../../src/sim/content";
import type { Build } from "../../src/sim/deck";
import { parRefs } from "../../src/sim/harness/par";
import { heartsLost, withScaleRigs } from "../../src/sim/scale";
import { ADD_MIN } from "../../src/game/counters";
import { setupRun } from "../../src/tooling";
import { battleSeed } from "../../src/game/run";

const OUT = process.argv[2] ?? "moment.json";
const FOES: HeroId[] = ["weaver", "foundry", "bastion"];
const RUN = { hero: "furnace" as HeroId, seed: 4242, wins: 4, lives: 6 };

/** The par deck with the three swaps, or null when it has no rare rig, no common rig or no gear to swap. */
function swapped(b: Build): Build | null {
  const d = structuredClone(b);
  const one = (def: string, rarity: string) => ITEMS[def]?.kind === "gate" && ITEMS[def].rarity === rarity && !ITEMS[def].foot && ITEMS[def].size === 1;
  const rare = d.items.find((p) => one(p.def, "rare") && p.def !== "keg");
  const common = d.items.find((p) => one(p.def, "common"));
  const gear = d.mods.find((m) => ITEMS[m.def]?.kind === "mod");
  if (!rare || !common || !gear) return null;
  rare.def = "keg";
  common.def = "grudgerod";
  gear.def = "spallcatcher";
  return d;
}

interface Moment { tick: number; t: number; hits: number; keg: number; pop: { def: string; amount: number } }
interface Pick { day: number; seed: number; run: typeof RUN & { day: number }; i: number; foe: string; a: Build; b: Build; swaps: string; secs: number; winner: number; moment: Moment }
const picks: Pick[] = [];

withScaleRigs(() => {
  for (const day of [8, 9, 10, 7, 6]) {
    const run = setupRun({ ...RUN, day }), seed = battleSeed(run), lost = heartsLost(run.lives, run);
    const mine = parRefs("furnace", day, "field", 4);
    for (let i = 0; i < mine.length; i++) {
      const a = swapped(mine[i]);
      if (!a) continue;
      for (const h of FOES) parRefs(h, day, "field", 4).forEach((b, j) => {
        const bt = new Battle(structuredClone(a), structuredClone(b), seed, [run.wins, 0], day, [lost, 0]);
        const keg = bt.sides[0].gates.find((g) => g.def.id === "keg");
        let best: Moment | null = null;
        while (!bt.over && bt.ticks < 60 * 200) {
          bt.step();
          for (const e of bt.drainEvents()) {
            if (e.type !== "process" || e.side !== 0 || !e.add || e.add.kind !== "dmg" || e.add.amount < ADD_MIN) continue;
            const hits = bt.sides[0].hitsTaken ?? 0, kh = keg?.ownHits ?? 0;
            if (bt.t < 8 || bt.t > 20 || hits < 3 || kh < 4) continue;
            if (!best || hits > best.hits) best = { tick: bt.ticks, t: +bt.t.toFixed(3), hits, keg: kh, pop: { def: e.def, amount: e.add.amount } };
          }
        }
        if (best) picks.push({ day, seed, run: { ...RUN, day }, i, foe: `${h}${j + 1}`, a, b, swaps: "first rare rig -> keg, first common rig -> grudgerod, first gear -> spallcatcher", secs: +bt.t.toFixed(1), winner: bt.winner ?? -1, moment: best });
      });
    }
    console.log(`day ${day}: seed ${seed}, ${picks.filter((p) => p.day === day).length} fights with the moment`);
    if (picks.length >= 5) break;
  }
});
picks.sort((x, y) => y.moment.hits - x.moment.hits || y.moment.keg - x.moment.keg);
const top = picks.slice(0, 5);
for (const p of top) console.log(`d${p.day} furnace${p.i + 1} (swapped) v ${p.foe} s${p.seed}: tick ${p.moment.tick} (${p.moment.t} s): hits on you ${p.moment.hits}, keg hits ${p.moment.keg}, pop ${p.moment.pop.def} +${p.moment.pop.amount}; ${p.secs} s w${p.winner}`);
writeFileSync(OUT, JSON.stringify({ top }, null, 1));
