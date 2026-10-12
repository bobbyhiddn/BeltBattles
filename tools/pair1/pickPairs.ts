// PAIR-CUE (REQ-BFG-100, REQ-BFG-081) tooling, not shipped: picks the fights the PAIR cue's stills, checks and pool counts
// use. For days 6-10 it plays every pairing of a deck pool whose BOTH sides hold a pair reader (a turret with `pairing`:
// TWIN TRIGGER, SEAM WELDER or a PAIR rune), from the par fields (four heroes, k 4) and the rivals' decks (rivals.ts
// rivalBuild), at seed 1, headless (sim/battle.ts Battle, read only), and counts on each side: the `pair` events, the
// FOUNDRY fusions among them, and the near misses (a load in a pair reader's chamber whose SYNC_WINDOW closed unpaired
// while another of the turret's intakes delivered within the next SYNC_WINDOW). Writes the top fights by pairs on both
// sides ("pairs") and by near misses on both sides ("near") with both decks (bb.openFight(a, b, seed) replays one exactly).
// Build: npx vite build --ssr tools/pair1/pickPairs.ts --outDir <W>/tmp/p1pick --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/p1pick/pickPairs.js <out.json> [days, default 6,7,8,9,10]

import { writeFileSync } from "node:fs";
import { Battle, type Payload, type Side } from "../../src/sim/battle";
import type { HeroId } from "../../src/sim/content";
import type { Build } from "../../src/sim/deck";
import { parRefs } from "../../src/sim/harness/par";
import { RIVAL_IDS, rivalBuild } from "../../src/sim/rivals";
import { SYNC_WINDOW } from "../../src/sim/races/foundry";

const OUT = process.argv[2] ?? "pairs.json";
const DAYS = (process.argv[3] ?? "6,7,8,9,10").split(",").map(Number);
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

interface Row { day: number; seed: number; a: Build; b: Build; ia: string; ib: string; pairs: number[]; fusions: number[]; near: number[]; lone: number[]; firstPair: number[]; secs: number; winner: number }
const rows: Row[] = [];

const pairing = (b: Build): boolean => {
  const bt = new Battle(structuredClone(b), structuredClone(b), 1);
  return bt.sides[0].turrets.some((tu) => tu.pairing);
};

for (const day of DAYS) {
  const pool: { id: string; b: Build }[] = [];
  for (const h of HEROES) parRefs(h, day, "field", 4).forEach((b, i) => pool.push({ id: `${h}${i + 1}`, b }));
  for (const r of RIVAL_IDS) {
    try { pool.push({ id: r, b: rivalBuild(r, day) }); } catch { /* a rival with no deck that day */ }
  }
  const readers = pool.filter((d) => pairing(d.b));
  for (let i = 0; i < readers.length; i++) for (let j = 0; j < readers.length; j++) {
    if (i === j) continue;
    const seed = 1, bt = new Battle(structuredClone(readers[i].b), structuredClone(readers[j].b), seed);
    const pairs = [0, 0], fusions = [0, 0], near = [0, 0], lone = [0, 0], firstPair = [-1, -1];
    // each chamber load's entry, until judged: [side, slot, route, at]
    const open = new Map<Payload, [Side, number, number, number]>();
    const delivered: [Side, number, number, number][] = []; // side, slot, route, at
    let n = 0;
    while (!bt.over && n < 60 * 200) {
      bt.step();
      const ev = bt.drainEvents();
      n++;
      for (let k = 0; k < ev.length; k++) {
        const e = ev[k];
        if (e.type === "pair") {
          pairs[e.side]++;
          if (firstPair[e.side] < 0) firstPair[e.side] = +bt.t.toFixed(2);
          if (k > 0 && ev[k - 1].type === "fuse") fusions[e.side]++;
        }
      }
      for (const side of [0, 1] as Side[]) {
        const s = bt.sides[side];
        if (!s.pairs) continue;
        for (const tu of s.turrets) {
          if (!tu.pairing) continue;
          for (const q of tu.stack) {
            const m = s.pairs.get(q);
            if (m && !open.has(q) && Math.abs(bt.t - m.at) < 1e-6) { open.set(q, [side, tu.index, m.route, m.at]); delivered.push([side, tu.index, m.route, m.at]); }
          }
        }
      }
      // judge each load once its window and the next have passed
      for (const [q, [side, slot, route, at]] of open) {
        if (bt.t - at <= 2 * SYNC_WINDOW) continue;
        open.delete(q);
        if (q.paired) continue;
        lone[side]++;
        if (delivered.some(([sd, sl, r, t2]) => sd === side && sl === slot && r !== route && t2 - at > SYNC_WINDOW && t2 - at <= 2 * SYNC_WINDOW)) near[side]++;
      }
    }
    rows.push({ day, seed, a: readers[i].b, b: readers[j].b, ia: readers[i].id, ib: readers[j].id, pairs, fusions, near, lone, firstPair, secs: +bt.t.toFixed(1), winner: bt.winner ?? -1 });
  }
  console.log(`day ${day}: ${pool.length} decks, ${readers.length} with a pair reader (${readers.map((d) => d.id).join(" ")}), ${rows.filter((f) => f.day === day).length} fights`);
}
const both = (v: number[]) => Math.min(v[0], v[1]);
const byPairs = [...rows].sort((x, y) => both(y.pairs) - both(x.pairs) || y.pairs[0] + y.pairs[1] - x.pairs[0] - x.pairs[1]).slice(0, 6);
const byNear = [...rows].sort((x, y) => both(y.near) - both(x.near) || y.near[0] + y.near[1] - x.near[0] - x.near[1]).slice(0, 6);
const line = (f: Row) => `d${f.day} ${f.ia} v ${f.ib} s${f.seed}: pairs ${f.pairs} (fusions ${f.fusions}) near ${f.near} lone ${f.lone} first ${f.firstPair} ${f.secs}s w${f.winner}`;
console.log("== by pairs on both sides");
for (const f of byPairs) console.log(line(f));
console.log("== by near misses on both sides");
for (const f of byNear) console.log(line(f));
writeFileSync(OUT, JSON.stringify({ pairs: byPairs, near: byNear }, null, 1));
