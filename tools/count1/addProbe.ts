// COUNT-1 (REQ-BFG-100, C11) tooling, not shipped: how often a live count-driven rig's add (LODESTONE, LONG HAUL, PINCER,
// COUNTERWEIGHT, QUENCH TANK: game/counters.ts COUNT_ADDS; each with no fixed part at bb-0.9.7) reaches C11's lines (10, a
// pop; 140, the big style) in real fights, and how many such pops would be alive at once (a plain pop's 0.85 s, a big one's
// 1.15 s): the C11 pool budget SCALE-2a's event will feed. It reads each add as the slug's own `flat` before and after the
// rig's hit, by wrapping this process's Battle instance's applyHit (read only; inside this probe only: the shipped view
// never does this, which is why C11 waits for SCALE-2a's event). Every pairing of the pickFights pool, seeds 1-4.
// Build: npx vite build --ssr tools/count1/addProbe.ts --outDir <W>/tmp/c1add --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/c1add/addProbe.js [days, default 8,9,10]

import { Battle, type Side } from "../../src/sim/battle";
import type { HeroId } from "../../src/sim/content";
import type { Build } from "../../src/sim/deck";
import { parRefs } from "../../src/sim/harness/par";
import { ADD_BIG, ADD_MIN, COUNT_ADDS } from "../../src/game/counters";

const DAYS = (process.argv[2] ?? "8,9,10").split(",").map(Number);
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const IDS = new Set(COUNT_ADDS.map((c) => c.id));
type Priv = { applyHit: (s: { side: Side }, a: { p: { flat: number } }, h: { g: { def: { id: string } } }) => unknown };

const byDef: Record<string, { hits: number; pops: number; big: number; max: number }> = {};
let fights = 0, withAdds = 0, worstAlive = 0, worstAliveAt = "";
for (const day of DAYS) {
  const pool: { id: string; b: Build }[] = [];
  for (const h of HEROES) parRefs(h, day, "field", 4).forEach((b, i) => pool.push({ id: `${h}${i + 1}`, b }));
  for (let i = 0; i < pool.length; i++) for (let j = 0; j < pool.length; j++) {
    if (i === j || pool[i].b.hero === pool[j].b.hero) continue;
    for (const seed of [1, 2, 3, 4]) {
      const bt = new Battle(structuredClone(pool[i].b), structuredClone(pool[j].b), seed), pv = bt as unknown as Priv;
      const orig = pv.applyHit.bind(bt);
      const pops: { t: number; end: number }[] = [];
      pv.applyHit = (s, a, h) => {
        if (!IDS.has(h.g.def.id)) return orig(s, a, h);
        const before = a.p.flat, r = orig(s, a, h), add = a.p.flat - before;
        const d = (byDef[h.g.def.id] ??= { hits: 0, pops: 0, big: 0, max: 0 });
        d.hits++;
        d.max = Math.max(d.max, add);
        if (add >= ADD_MIN) { d.pops++; pops.push({ t: bt.t, end: bt.t + (add >= ADD_BIG ? 1.15 : 0.85) }); }
        if (add >= ADD_BIG) d.big++;
        return r;
      };
      let n = 0;
      while (!bt.over && n < 60 * 200) { bt.step(); bt.drainEvents(); n++; }
      fights++;
      if (pops.length) withAdds++;
      for (const p of pops) {
        const alive = pops.filter((q) => q.t <= p.t && q.end > p.t).length;
        if (alive > worstAlive) { worstAlive = alive; worstAliveAt = `d${day} ${pool[i].id} v ${pool[j].id} s${seed} t=${p.t.toFixed(2)}`; }
      }
    }
  }
}
console.log(`fights ${fights}, with a C11 add >= ${ADD_MIN}: ${withAdds}`);
for (const [id, d] of Object.entries(byDef)) console.log(`${id}: hits ${d.hits}, adds >= ${ADD_MIN} ${d.pops}, >= ${ADD_BIG} ${d.big}, max ${d.max}`);
console.log(`most C11 pops alive at once (game seconds): ${worstAlive} at ${worstAliveAt}`);
