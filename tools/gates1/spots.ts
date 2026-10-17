// GATES-1 step 7a (REQ-BFG-052; BRIEF-GATES1 G7 a): THE SPOTS BENCH. Each gate at its BEST spot (the par player's rule, splitPreview.ts
// suggestSplit: the FUSER on the second-last tile before a heavy gun, the SCATTER MILL and SMELTER mid-belt) against a CARELESS
// mid-belt spot and against the same deck without it, on the fitting par decks, days 3, 6 and 10, per hero, paired fights (the
// same foes, seeds and sides), with the gate at ★1 on day 3, ★2 on day 6 and ★3 on day 10 (the stars carry the late game).
// FUSER: at its best spot on FURNACE and BASTION, day 10 must read 0 points or better (r1d found it fading to -6 to -11 in 12 s
// fights; today's are longer).
// The subject's par field (parField, seeds 1..--k, any gate it holds lifted off) plays the par fields of the four playable
// heroes (each hero's first --m members, its own member left out), --seeds seeds x both sides a pairing, on the day's rules.
// Label of every read: "GATES on, with SHAPES2, PLAIN_RIGS and LONG_RUN as bump-accepted ships them, before BUMP-1E's scaling flip".
// Usage: node <built>/spots.js --hero furnace --days 3,6,10 --k 24 --m 6 --seeds 2 --gates fuser,scattermill,smelter --out f.json
//        [--set fuser.bonus=60] [--long on|off]. One process a hero, at most 4 at once, nice -n 19. Writes only --out.
import { writeFileSync } from "node:fs";
import { hashSeed } from "../../src/core/rng";
import { ITEMS } from "../../src/sim/content";
import type { Build } from "../../src/sim/deck";
import { parField } from "../../src/sim/harness/par";
import { playJob, type Job } from "../../src/sim/harness/tournament";
import { HEROES, applySets, arg, bestSpot, ci, mean, midSpot, setWorld, star, stripGates, withGate, type Hero } from "./world";

const HERO = arg("--hero", "furnace") as Hero;
const DAYS = arg("--days", "3,6,10").split(",").map(Number);
const K = Number(arg("--k", "24")), M = Number(arg("--m", "6")), SEEDS = Number(arg("--seeds", "2"));
const IDS = arg("--gates", "fuser,scattermill,smelter").split(",").filter(Boolean);
const OUT = arg("--out", `spots-${HERO}.json`);
const label = setWorld(true);
const sets = applySets();

const t0 = Date.now();
const rows: unknown[] = [];
for (const day of DAYS) {
  const mine = parField(HERO, day, K).map(stripGates);
  const foes = HEROES.map((h) => parField(h, day, M));
  const field: Build[] = [...foes.flat()];
  /** Points per battle of `b` (the subject's member `self`) against every foe member it meets (all sides and seeds, in a fixed order). */
  const play = (b: Build, self: number, key: string): number[] => {
    const at = field.length;
    field.push(b);
    const pts: number[] = [];
    HEROES.forEach((h, hi) => foes[hi].forEach((_, mi) => {
      if (h === HERO && mi === self) return;
      const job: Job = { a: at, b: hi * M + mi, seeds: Array.from({ length: SEEDS }, (_, s) => hashSeed("gates1-spots", key, day, HERO, self, h, mi, s)), day };
      pts.push(playJob(field, job) / (2 * SEEDS));
    }));
    field.pop();
    return pts;
  };
  const whole = new Map<number, number[]>();
  const base = (i: number): number[] => { if (!whole.has(i)) whole.set(i, play(mine[i], i, "none")); return whole.get(i)!; };
  for (const id of IDS) {
    if (!ITEMS[id]) { console.log(`spots ${HERO} d${day} ${id}: not in ITEMS, skipped`); continue; }
    const stars = star(day);
    const best: number[] = [], careless: number[] = [], fits: number[] = [];
    mine.forEach((b, i) => {
      const bs = bestSpot(b, id), ms = midSpot(b, id);
      if (!bs || !ms) return;
      fits.push(i);
      const w = mean(base(i));
      best.push(mean(play(withGate(b, id, stars, bs), i, `best-${id}`)) - w);
      careless.push(mean(play(withGate(b, id, stars, ms), i, `mid-${id}`)) - w);
    });
    const none = fits.map((i) => mean(base(i)));
    const row = { hero: HERO, day, id, stars, decks: fits.length, of: K, none: 100 * mean(none), best: ci(best), careless: ci(careless), diff: ci(best.map((x, j) => x - careless[j])) };
    rows.push(row);
    const f = (x: { m: number; ci: number }) => `${x.m >= 0 ? "+" : ""}${x.m.toFixed(1)} (±${x.ci.toFixed(1)})`;
    console.log(`spots ${HERO} d${day} ★${stars} ${id.padEnd(11)} fits ${fits.length}/${K} | none ${row.none.toFixed(1)}% | best ${f(row.best)} | careless ${f(row.careless)} | best - careless ${f(row.diff)} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
writeFileSync(OUT, JSON.stringify({ hero: HERO, label, sets, days: DAYS, k: K, m: M, seeds: SEEDS, rows, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
console.log(`spots ${HERO}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
