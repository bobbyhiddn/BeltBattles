// SCALE-2b (REQ-BFG-108, REQ-BFG-100 C1; BRIEF-SCALE2b step 6) tooling, not shipped: picks the stills' fight moment, with
// SCALE_RIGS on (withScaleRigs: the AFTER page's switch): days 6-10, every cross-hero pairing of the par fields (FURNACE,
// WEAVER, FOUNDRY and BASTION, 4 decks each; tools/scale2a/readerMoment.ts's pool), seed 1, YOUR side (side 0, drawn at the
// bottom) holding VENOM DRIP. The moment: a POISON tick on the foe's hull (its `poison` event) between 6 s and 18 s while
// that hull also holds BURN, so the foe's status row shows the POISON chip beside BURN's and the tick's venom number pops
// on the hull; the most POISON first. bb.openFight(a, b, seed) replays one exactly (a stored record, no day: as here).
// Build: npx vite build --ssr tools/scale2b/poisonMoment.ts --outDir <W>/tmp/s2bpick --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/s2bpick/poisonMoment.js <out.json>
import { writeFileSync } from "node:fs";
import { Battle } from "../../src/sim/battle";
import type { HeroId } from "../../src/sim/content";
import type { Build } from "../../src/sim/deck";
import { parRefs } from "../../src/sim/harness/par";
import { withScaleRigs } from "../../src/sim/scale";
import { burnStacks } from "../../src/sim/scale";

const OUT = process.argv[2] ?? "moment.json";
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const venom = (b: Build): number => b.items.filter((p) => p.def === "venom").length;

interface Tick { tick: number; t: number; dmg: number; poison: number; burn: number }
interface Pick { day: number; seed: number; ia: string; ib: string; a: Build; b: Build; venoms: number; ticks: number; secs: number; winner: number; moment: Tick }
const picks: Pick[] = [];

withScaleRigs(() => {
  for (const day of [6, 7, 8, 9, 10]) {
    const pool: { id: string; b: Build }[] = [];
    for (const h of HEROES) parRefs(h, day, "field", 4).forEach((b, i) => pool.push({ id: `${h}${i + 1}`, b }));
    let n = 0, with0 = 0;
    for (let i = 0; i < pool.length; i++) for (let j = 0; j < pool.length; j++) {
      if (i === j || pool[i].b.hero === pool[j].b.hero || !venom(pool[i].b)) continue;
      with0++;
      const seed = 1, bt = new Battle(structuredClone(pool[i].b), structuredClone(pool[j].b), seed);
      const ticks: Tick[] = [];
      while (!bt.over && bt.ticks < 60 * 200) {
        bt.step();
        for (const e of bt.drainEvents()) {
          if (e.type !== "poison" || e.side !== 1) continue;
          const foe = bt.sides[1].hull;
          ticks.push({ tick: bt.ticks, t: +bt.t.toFixed(3), dmg: e.dmg, poison: foe.poison ?? 0, burn: burnStacks(foe) });
        }
      }
      n++;
      const good = ticks.filter((k) => k.t >= 6 && k.t <= 18 && k.burn > 0);
      if (!good.length) continue;
      const moment = good.reduce((x, y) => (y.poison > x.poison || (y.poison === x.poison && y.burn > x.burn) ? y : x));
      picks.push({ day, seed, ia: pool[i].id, ib: pool[j].id, a: pool[i].b, b: pool[j].b, venoms: venom(pool[i].b), ticks: ticks.length, secs: +bt.t.toFixed(1), winner: bt.winner ?? -1, moment });
    }
    console.log(`day ${day}: ${pool.length} decks, ${with0} fights with VENOM DRIP on side 0, ${n} run, ${picks.filter((p) => p.day === day).length} with a POISON tick beside BURN in 6-18 s`);
  }
});
picks.sort((x, y) => y.moment.poison - x.moment.poison || y.moment.burn - x.moment.burn || x.day - y.day);
const top = picks.slice(0, 5);
for (const p of top) console.log(`d${p.day} ${p.ia} v ${p.ib} s${p.seed}: ${p.venoms} VENOM DRIP; tick ${p.moment.tick} (${p.moment.t} s): foe POISON ${p.moment.poison}, BURN ${p.moment.burn}, the tick ${p.moment.dmg}; ${p.ticks} ticks in ${p.secs} s, w${p.winner}`);
writeFileSync(OUT, JSON.stringify({ top }, null, 1));
