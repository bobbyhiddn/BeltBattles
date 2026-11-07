// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T5a): THE RIVAL FIGHTS. Par's win rate against each rival's deck at each moment it is fielded (the road warlord,
// rivalBuild(id, day), and the dusk stand-in, standInBuild(id, day)), by day, in the four states the brief names, on the SAME par decks and battle seeds:
//   A  ENCHANT off (the pins' world: no word anywhere)
//   B  ENCHANT on, the rivals' words out (npcWords.ts setNpcWords(false)): the player's words only, as ENCHANT-1c shipped (par buys at the ENCHANTER, takes
//      the warlord pick and LAST CHANCE's part; no drop carries a word)
//   C  B plus T1 and T2: the rivals carry their words and their drops keep them, the shrine out of the bag
//   D  C plus the ASH SHRINE in the bag (T3)
// "At the lucks the road uses" is rivalBuild/standInBuild themselves (luckOf(id) for the warlord, ordinary for the stand-in), so the decks are the game's.
// The pairing is cross.ts's form (tools/enchant1): par decks parField(hero, day, K) of each hero; seed s of (hero, day, rival, moment) puts par deck i against the
// rival deck from both sides; a draw counts a half. One hero per process (--hero), four at once (the brief's limit), merged by the report script.
// Usage: node <built>/rivals.js --state C --hero furnace --days 5-16 --k 24 --seeds 1 --out rivals-C-furnace.json
// Pure harness reads; writes only --out.
import { writeFileSync } from "node:fs";
import { hashSeed } from "../../src/core/rng";
import { simulate } from "../../src/sim/battle";
import type { HeroId } from "../../src/sim/content";
import type { Build } from "../../src/sim/deck";
import { setEnchant } from "../../src/sim/enchant";
import { parField } from "../../src/sim/harness/par";
import { setNpcWords } from "../../src/sim/npcWords";
import { setShrine } from "../../src/game/shrine";
import { RIVAL_IDS, RIVALS, rivalBuild, rivalDays, standInBuild, type RivalId } from "../../src/sim/rivals";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const STATE = arg("--state", "A") as "A" | "B" | "C" | "D";
const range = (s: string): number[] => (/^(\d+)-(\d+)$/.test(s) ? Array.from({ length: Number(s.split("-")[1]) - Number(s.split("-")[0]) + 1 }, (_, i) => Number(s.split("-")[0]) + i) : s.split(",").map(Number));
const DAYS = range(arg("--days", "5-16"));
const K = Number(arg("--k", "24")), SEEDS = Number(arg("--seeds", "1"));
const HEROES = arg("--hero", "furnace,weaver,foundry,bastion").split(",") as HeroId[];
const IDS = arg("--ids", "").split(",").filter(Boolean) as RivalId[];
const OUT = arg("--out", `rivals-${STATE}.json`);

if (STATE === "A") setEnchant(false);
else {
  setEnchant(true);
  setNpcWords(STATE !== "B"); // B: the rivals' words (and the drops that keep them) out
  setShrine(STATE === "D"); // B and C keep the ASH SHRINE out of the bag (the test-only toggle, src/game/shrine.ts); D has it in
}

const words = (b: Build): number => b.items.filter((p) => p.ench !== undefined).length + (b.turrets ?? []).filter((t) => t.ench !== undefined).length;

interface Cell { id: RivalId; day: number; moment: "warlord" | "dusk"; hero: HeroId; pts: number; n: number; rivalWords: number; parWords: number }
const cells: Cell[] = [];
const t0 = Date.now();
for (const day of DAYS) {
  const fields = HEROES.map((h) => parField(h, day, K));
  const parWords = fields.map((f) => f.reduce((n, b) => n + words(b), 0) / f.length);
  for (const id of RIVAL_IDS.filter((x) => !IDS.length || IDS.includes(x))) {
    if (!rivalDays(id, 16).includes(day)) continue;
    const decks: { moment: "warlord" | "dusk"; build: Build }[] = [];
    if (!RIVALS[id].standInOnly) decks.push({ moment: "warlord", build: rivalBuild(id, day) });
    if (id !== "matriarch") decks.push({ moment: "dusk", build: standInBuild(id, day) }); // she never stands in
    for (const { moment, build } of decks) {
      HEROES.forEach((hero, hi) => {
        let pts = 0, n = 0;
        for (let i = 0; i < K; i++) {
          for (let s = 0; s < SEEDS; s++) {
            const seed = hashSeed("e2rivals", day, id, moment, hero, i, s);
            const w0 = simulate(fields[hi][i], build, seed, undefined, undefined, day).winner; // par as side 0
            const w1 = simulate(build, fields[hi][i], seed, undefined, undefined, day).winner; // par as side 1
            pts += (w0 === 0 ? 1 : w0 === -1 ? 0.5 : 0) + (w1 === 1 ? 1 : w1 === -1 ? 0.5 : 0);
            n += 2;
          }
        }
        cells.push({ id, day, moment, hero, pts, n, rivalWords: words(build), parWords: parWords[hi] });
      });
    }
  }
  console.log(`rivals ${STATE} d${day} ${HEROES.join(",")}: ${cells.length} cells | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
writeFileSync(OUT, JSON.stringify({ state: STATE, heroes: HEROES, days: DAYS, k: K, seeds: SEEDS, seconds: Math.round((Date.now() - t0) / 1000), cells }, null, 0));
console.log(`rivals ${STATE}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
