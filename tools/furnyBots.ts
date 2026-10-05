// FURN-Y step 5 (bench only, never merged): how the bots take FURNACE's four runes once they are back in the pool. Run
// with FURNY_POOL=full (DORMANT_RUNES empty) and the sustain switch on. For each harness hero and par seed 1..N, the par
// player's day-`days` run (playerBuild); each dawn's offer recomputed from the run's seed (runeOffer(hashSeed(
// "par-player-run", hero, s), day, hero, the picks before it), the seed player.ts startRun gives newRun), and for each of
// the four: the dawns it was offered, the dawns it was taken, and what was taken instead when it was passed over.
//   FURNY_POOL=full nice -n 19 node <dist>/furnyBots.js --n 32 --days 10 --json out.json
import { writeFileSync } from "node:fs";
import { hashSeed } from "../src/core/rng";
import { withSustain, type HeroId } from "../src/sim/content";
import { playerBuild } from "../src/sim/harness/player";
import { DORMANT_RUNES, runeOffer } from "../src/sim/runes";

const flag = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const N = Number(flag("n") ?? 32), DAYS = Number(flag("days") ?? 10);
const FOUR = ["coal_chute", "heat_sink", "searing", "shatter_shot"];
const HEROES: HeroId[] = (flag("heroes")?.split(",") as HeroId[] | undefined) ?? ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
if (DORMANT_RUNES.size) console.log(`note: DORMANT_RUNES holds ${[...DORMANT_RUNES].join(", ")} (run with FURNY_POOL=full for the full pool)`);
const out: Record<string, unknown> = {};
for (const hero of HEROES) {
  const per: Record<string, { offered: number; taken: number; firstDay: number[]; passedFor: Record<string, number> }> = {};
  for (const id of FOUR) per[id] = { offered: 0, taken: 0, firstDay: [], passedFor: {} };
  let decksHolding = 0, picks = 0;
  for (let s = 1; s <= N; s++) {
    const b = withSustain(() => playerBuild(hero, DAYS, s), true);
    const ids = (b.runes ?? []).map((q) => q.id);
    const seed = hashSeed("par-player-run", hero, s);
    for (let d = 1; d <= ids.length; d++) {
      const offer = withSustain(() => runeOffer(seed, d, hero, ids.slice(0, d - 1)), true);
      picks++;
      for (const id of FOUR) if (offer.ids.includes(id)) {
        per[id].offered++;
        if (ids[d - 1] === id) { per[id].taken++; per[id].firstDay.push(d); } else per[id].passedFor[ids[d - 1]] = (per[id].passedFor[ids[d - 1]] ?? 0) + 1;
      }
    }
    if (ids.some((id) => FOUR.includes(id))) decksHolding++;
  }
  out[hero] = { decks: N, picks, decksHolding, per };
  console.log(`${hero}: ${decksHolding}/${N} day-${DAYS} decks hold one of the four; ${FOUR.map((id) => `${id} ${per[id].taken}/${per[id].offered}`).join(", ")}`);
  for (const id of FOUR) if (Object.keys(per[id].passedFor).length) console.log(`  ${id} passed over for: ${JSON.stringify(per[id].passedFor)}`);
}
const jf = flag("json");
if (jf) writeFileSync(jf, JSON.stringify({ n: N, days: DAYS, dormant: [...DORMANT_RUNES], out }, null, 1));
