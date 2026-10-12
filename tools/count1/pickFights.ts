// COUNT-1 (REQ-BFG-100) tooling, not shipped: picks the fights the counters' stills and checks use. For days 8-10 it plays
// every pairing of a small deck pool (FURNACE's and WEAVER's par fields, seeds 1-4; FOUNDRY's and BASTION's par decks) at
// seed 1, headless (sim/battle.ts Battle, read only), and scores each fight by the counters it lights on BOTH sides at its
// busiest tick (BURN stacks, FRAY, STUN, the soak layer, a gun with slugs waiting, a jam) with game/counters.ts's own
// values. Writes the top fights with both decks (bb.openFight(a, b, seed) replays one exactly) to the JSON file named.
// Build: npx vite build --ssr tools/count1/pickFights.ts --outDir <W>/tmp/c1pick --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/c1pick/pickFights.js <out.json> [days, default 8,9,10]

import { writeFileSync } from "node:fs";
import { Battle, type Side } from "../../src/sim/battle";
import { TICK, type HeroId } from "../../src/sim/content";
import type { Build } from "../../src/sim/deck";
import { parRefs } from "../../src/sim/harness/par";
import { burnStacks, slugsWaiting, stunnedParts } from "../../src/game/counters";

const OUT = process.argv[2] ?? "fights.json";
const DAYS = (process.argv[3] ?? "8,9,10").split(",").map(Number);
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

interface Peak { t: number; lit: number; counts: number[][] }
const fights: { day: number; seed: number; a: Build; b: Build; ia: string; ib: string; score: number; peak: Peak; jams: number[]; maxBurn: number[]; maxFray: number[]; maxStun: number[]; maxPlate: number[]; maxWait: number[]; lodestone: boolean[]; secs: number; winner: number }[] = [];

for (const day of DAYS) {
  const pool: { id: string; b: Build }[] = [];
  for (const h of HEROES) parRefs(h, day, "field", 4).forEach((b, i) => pool.push({ id: `${h}${i + 1}`, b }));
  for (let i = 0; i < pool.length; i++) for (let j = 0; j < pool.length; j++) {
    if (i === j || pool[i].b.hero === pool[j].b.hero) continue;
    const seed = 1, bt = new Battle(structuredClone(pool[i].b), structuredClone(pool[j].b), seed);
    const mx = { burn: [0, 0], fray: [0, 0], stun: [0, 0], plate: [0, 0], wait: [0, 0] };
    let peak: Peak = { t: 0, lit: -1, counts: [] };
    let n = 0;
    while (!bt.over && n < 60 * 200) {
      bt.step();
      bt.drainEvents();
      n++;
      if (n % 6) continue; // every 0.1 s
      const counts = ([0, 1] as Side[]).map((s) => {
        const sd = bt.sides[s];
        const c = [burnStacks(sd), sd.hull.fray, stunnedParts(sd), sd.plate.plate, Math.max(0, ...sd.turrets.map(slugsWaiting))];
        mx.burn[s] = Math.max(mx.burn[s], c[0]); mx.fray[s] = Math.max(mx.fray[s], c[1]); mx.stun[s] = Math.max(mx.stun[s], c[2]);
        mx.plate[s] = Math.max(mx.plate[s], c[3]); mx.wait[s] = Math.max(mx.wait[s], c[4]);
        return c;
      });
      const lit = counts.reduce((a, c) => a + c.filter((v) => v > 0).length, 0);
      if (lit > peak.lit && bt.t < 58) peak = { t: +(n * TICK).toFixed(2), lit, counts };
    }
    const jams = [bt.sides[0].stats.jams, bt.sides[1].stats.jams];
    const both = (m: number[]) => (m[0] > 0 && m[1] > 0 ? 1 : 0);
    const score = 3 * (both(mx.burn) + both(mx.fray) + both(mx.stun)) + both(mx.plate) + both(mx.wait) + (jams[0] > 0 ? 1 : 0) + (jams[1] > 0 ? 1 : 0) + peak.lit / 10;
    const lode = ([0, 1] as Side[]).map((s) => bt.sides[s].gates.some((g) => g.def.id === "lodestone"));
    fights.push({ day, seed, a: pool[i].b, b: pool[j].b, ia: pool[i].id, ib: pool[j].id, score, peak, jams, maxBurn: mx.burn, maxFray: mx.fray, maxStun: mx.stun, maxPlate: mx.plate, maxWait: mx.wait, lodestone: lode, secs: +bt.t.toFixed(1), winner: bt.winner ?? -1 });
  }
  console.log(`day ${day}: ${pool.length} decks, ${fights.filter((f) => f.day === day).length} fights`);
}
fights.sort((x, y) => y.score - x.score);
const top = fights.slice(0, 12);
for (const f of top) console.log(`d${f.day} ${f.ia} v ${f.ib} s${f.seed}: score ${f.score.toFixed(1)} peak t=${f.peak.t} lit ${f.peak.lit} burn ${f.maxBurn} fray ${f.maxFray} stun ${f.maxStun} plate ${f.maxPlate} wait ${f.maxWait} jams ${f.jams} lode ${f.lodestone} ${f.secs}s w${f.winner}`);
const lodes = fights.filter((f) => f.lodestone[0] || f.lodestone[1]).slice(0, 4);
for (const f of lodes) console.log(`LODESTONE d${f.day} ${f.ia} v ${f.ib}: score ${f.score.toFixed(1)} stun ${f.maxStun}`);
writeFileSync(OUT, JSON.stringify({ top, lodestone: lodes.map((f) => ({ day: f.day, seed: f.seed, ia: f.ia, ib: f.ib, a: f.a, b: f.b, maxStun: f.maxStun })) }, null, 1));
