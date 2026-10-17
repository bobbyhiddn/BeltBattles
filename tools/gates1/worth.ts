// GATES-1 step 7b (REQ-BFG-052; BRIEF-GATES1 G7 b): R2's +50% RULE, per gate. "Each gate's conversion is worth at least +50% of a
// slug in its best use. Show it per gate (damage per slug through it against without, on the day-6 decks)." (R2-PROPOSAL: "At my
// first numbers they lost fights, because the wait cost more than the queue. Every converter now gives at least +50%.")
// For each hero, the K par decks of day 6 (any gate lifted off), each gate at its BEST spot (splitPreview.ts suggestSplit) at
// ★1, ★2 and ★3, against the same deck without it, on a target barge (a Weaver with 100,000 hull and no belts: it never fires and
// never dies, so both decks fire for the whole window) for --secs seconds, --seeds seeds. Read from the sim's own counts:
//   damage = SideStats.damage (hits and BURN ticks), produced = SideStats.produced (slugs stamped), taken = the gate's slugs in;
//   a slug's worth = the damage a stamped slug deals without the gate (damage / produced);
//   GROSS WORTH of a slug through the gate (the rule's reading: what the CONVERSION gives, the wait left out) =
//     ((damage with / produced with) / (damage without / produced without) - 1) x produced with / taken;
//   NET WORTH (what the deck gets once the 1 s a conversion and the belt backing up behind it are paid) =
//     (damage with - damage without) / taken / a slug's worth.
// The rule asks for GROSS >= +50% in the gate's best use (best = the best quarter of the decks it fits). Also the whole-fight damage change.
// Usage: node <built>/worth.js --day 6 --k 24 --secs 30 --seeds 3 --out worth.json [--heroes furnace,weaver,foundry,bastion]
// Label: "GATES on, with SHAPES2, PLAIN_RIGS and LONG_RUN as bump-accepted ships them, before BUMP-1E's scaling flip".
// Pure harness reads; writes only --out.
import { writeFileSync } from "node:fs";
import { hashSeed } from "../../src/core/rng";
import { simulate } from "../../src/sim/battle";
import type { Build } from "../../src/sim/deck";
import { GATES_IDS } from "../../src/sim/gates";
import { parField } from "../../src/sim/harness/par";
import { HEROES, applySets, arg, bestSpot, ci, mean, setWorld, stripGates, withGate } from "./world";

const DAY = Number(arg("--day", "6")), K = Number(arg("--k", "24")), SECS = Number(arg("--secs", "30")), SEEDS = Number(arg("--seeds", "3"));
const HS = arg("--hero", arg("--heroes", HEROES.join(","))).split(",").filter(Boolean) as (typeof HEROES)[number][];
const IDS = arg("--gates", GATES_IDS.join(",")).split(",").filter(Boolean);
const OUT = arg("--out", "worth.json");
const label = setWorld(true);
const sets = applySets();
const barge = (): Build => ({ hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 5 }], routes: [], mods: [], beltCap: 24, hullBonus: 100000 });

interface Read { damage: number; produced: number; done: number; taken: number }
/** One fight of `b` against the barge: the side's damage and stamped slugs, and the gate `id`'s conversions and slugs taken in. */
function fight(b: Build, seed: number, id?: string): Read {
  const s = simulate(b, barge(), seed, 60 * SECS, undefined, DAY).sides[0];
  const cs = (s.converters ?? []).filter((c) => c.def.id === id);
  return { damage: s.stats.damage, produced: s.stats.produced, done: cs.reduce((n, c) => n + c.done, 0), taken: cs.reduce((n, c) => n + c.done * c.spec.in, 0) };
}
const topQuarter = (xs: number[]): number => { const s = [...xs].sort((p, q) => q - p); return mean(s.slice(0, Math.max(1, Math.ceil(s.length / 4)))); };

const t0 = Date.now();
const rows: unknown[] = [];
for (const hero of HS) {
  const decks = parField(hero, DAY, K).map(stripGates);
  for (const id of IDS) {
    for (const stars of [1, 2, 3]) {
      const gross: number[] = [], net: number[] = [], whole: number[] = [], conv: number[] = [], perSlug: number[] = [];
      let fits = 0;
      decks.forEach((b, di) => {
        const at = bestSpot(b, id);
        if (!at) return;
        fits++;
        const g = withGate(b, id, stars, at);
        const dA: number[] = [], pA: number[] = [], dB: number[] = [], pB: number[] = [], cB: number[] = [], tB: number[] = [];
        for (let s = 0; s < SEEDS; s++) {
          const seed = hashSeed("gates1-worth", hero, DAY, di, s);
          const a = fight(b, seed), w = fight(g, seed, id);
          dA.push(a.damage); pA.push(a.produced); dB.push(w.damage); pB.push(w.produced); cB.push(w.done); tB.push(w.taken);
        }
        const slugWorth = mean(dA) / Math.max(1, mean(pA));
        if (mean(tB) > 0) {
          net.push((mean(dB) - mean(dA)) / mean(tB) / slugWorth);
          gross.push(((mean(dB) / Math.max(1, mean(pB))) / slugWorth - 1) * mean(pB) / mean(tB));
        }
        whole.push(mean(dB) / Math.max(1, mean(dA)) - 1);
        conv.push(mean(cB)); perSlug.push(slugWorth);
      });
      const gr = ci(gross), ne = ci(net), wh = ci(whole);
      const f = (x: { m: number; ci: number }, d = 0): string => `${x.m >= 0 ? "+" : ""}${x.m.toFixed(d)}% (±${x.ci.toFixed(d)})`;
      rows.push({ hero, day: DAY, id, stars, decks: fits, of: K, grossPct: gr.m, grossCI: gr.ci, grossBestQuarterPct: 100 * topQuarter(gross), netPct: ne.m, netCI: ne.ci, wholeFightPct: wh.m, wholeFightCI: wh.ci, conversions: mean(conv), slugWorth: mean(perSlug) });
      console.log(`worth ${hero.padEnd(8)} d${DAY} ${id.padEnd(11)} ★${stars} decks ${fits}/${K} | a slug through it: gross ${f(gr)} (best quarter +${(100 * topQuarter(gross)).toFixed(0)}%), net ${f(ne)} | the whole ${SECS} s: damage ${f(wh, 1)} | conversions ${mean(conv).toFixed(1)} | a slug's damage ${mean(perSlug).toFixed(1)} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  }
}
writeFileSync(OUT, JSON.stringify({ label, sets, day: DAY, k: K, secs: SECS, seeds: SEEDS, rows, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
console.log(`worth: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
