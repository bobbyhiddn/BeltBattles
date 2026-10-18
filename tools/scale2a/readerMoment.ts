// SCALE-2a (REQ-BFG-100, C11; BRIEF-SCALE2a step 7) tooling, not shipped: picks the stills' fight moment, a live count rig
// (LONG HAUL, COUNTERWEIGHT or QUENCH TANK) on YOUR side (side 0, drawn at the bottom) popping +n (its process event's
// `add`, n >= ADD_MIN), days 8-10, every cross-hero pairing of the par fields (FURNACE, WEAVER, FOUNDRY and BASTION, 4
// decks each; tools/count1/pickFights.ts's pool) at seed 1, headless (sim/battle.ts Battle, read only; SCALE_RIGS as
// shipped). The moment: a pop between 6 s and 18 s with no other reader pop within 0.5 s, the biggest first. Writes the
// best fight and its next four (a re-pick) with both decks (bb.openFight(a, b, seed, { day }) replays one exactly).
// Build: npx vite build --ssr tools/scale2a/readerMoment.ts --outDir <W>/tmp/s2apick --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/s2apick/readerMoment.js <out.json>
import { writeFileSync } from "node:fs";
import { Battle } from "../../src/sim/battle";
import type { HeroId } from "../../src/sim/content";
import type { Build } from "../../src/sim/deck";
import { parRefs } from "../../src/sim/harness/par";
import { ADD_MIN } from "../../src/game/counters";

const OUT = process.argv[2] ?? "moment.json";
const LIVE = ["longhaul", "counterweight", "quench"];
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

interface Pop { tick: number; t: number; amount: number; def: string; route: number; tile: number; gate: number }
interface Pick { day: number; seed: number; ia: string; ib: string; a: Build; b: Build; pops: number; max: number; defs: string[]; secs: number; winner: number; moment: Pop }
const picks: Pick[] = [];

for (const day of [8, 9, 10]) {
  const pool: { id: string; b: Build }[] = [];
  for (const h of HEROES) parRefs(h, day, "field", 4).forEach((b, i) => pool.push({ id: `${h}${i + 1}`, b }));
  let n = 0;
  for (let i = 0; i < pool.length; i++) for (let j = 0; j < pool.length; j++) {
    if (i === j || pool[i].b.hero === pool[j].b.hero) continue;
    const seed = 1, bt = new Battle(structuredClone(pool[i].b), structuredClone(pool[j].b), seed);
    const pops: Pop[] = [], all: number[] = [];
    while (!bt.over && bt.ticks < 60 * 200) {
      bt.step();
      for (const e of bt.drainEvents()) {
        if (e.type !== "process" || !e.add || e.add.amount < ADD_MIN) continue;
        all.push(bt.ticks);
        if (e.side === 0 && LIVE.includes(e.def)) pops.push({ tick: bt.ticks, t: +bt.t.toFixed(3), amount: e.add.amount, def: e.def, route: e.route, tile: e.tile, gate: e.gate });
      }
    }
    n++;
    const lone = pops.filter((p) => p.t >= 6 && p.t <= 18 && all.filter((k) => Math.abs(k - p.tick) <= 30).length === 1);
    if (!lone.length) continue;
    const moment = lone.reduce((x, y) => (y.amount > x.amount ? y : x));
    picks.push({ day, seed, ia: pool[i].id, ib: pool[j].id, a: pool[i].b, b: pool[j].b, pops: pops.length, max: Math.max(...pops.map((p) => p.amount)),
      defs: [...new Set(pops.map((p) => p.def))], secs: +bt.t.toFixed(1), winner: bt.winner ?? -1, moment });
  }
  console.log(`day ${day}: ${pool.length} decks, ${n} fights, ${picks.filter((p) => p.day === day).length} with a lone live reader pop on side 0`);
}
picks.sort((x, y) => y.moment.amount - x.moment.amount || x.day - y.day);
const top = picks.slice(0, 5);
for (const p of top) console.log(`d${p.day} ${p.ia} v ${p.ib} s${p.seed}: ${p.moment.def} +${p.moment.amount} at ${p.moment.t} s (tick ${p.moment.tick}, route ${p.moment.route} tile ${p.moment.tile}); ${p.pops} pops, max ${p.max}, ${p.defs.join("/")}; ${p.secs} s w${p.winner}`);
writeFileSync(OUT, JSON.stringify({ top }, null, 1));
