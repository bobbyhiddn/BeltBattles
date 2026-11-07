// ENCHANT-1 step 9 (run 4; REQ-BFG-085 (6); BRIEF-ENCHANT1 E9a, BRACED): HOW MANY STUNs LAND ON A PAR-FIELD DECK IN ONE FIGHT, and on what.
// The bots' BRACED valuation (enchantBot.ts wordGain; `stunsPerFight(day)` is the named guess 1 + 0.4 x day: 3 on day 5, 5 on day 10; this tool,
// O/bench/stuns-st1-*, measured 0.86 x day on a rig, factory or turret; the bots KEEP the guess, enchantBot.ts says why) was a guess; run 3's
// report asked E9 to measure it (SideStats has only the seconds disrupted, but Battle.acceptHarassment pushes a `harass` event for every STUN it
// ACCEPTS, with the kind of the target: a STUN that TOLLBOOTH or BRACED swallows pushes none). This tool plays the same battles the E9a bench
// plays (the hero's par field of the day, k decks, `--opp` opponents each from the other heroes' fields, both sides, ENCHANT OFF so no deck holds
// a word) and tallies the accepted STUNs that landed on the deck's own side, by the kind of piece they landed on (gate = a rig, factory,
// turret, belt = a belt tile, which holds no word). Only the first three can be BRACED, so the valuation's number is theirs.
// Usage: node <built>/stuns.js --days 3,5,7,10 --k 96 --opp 12 --out stuns.json [--hero furnace]  (K/e1bench.sh builds and runs it; PERHERO=1: four processes)
// Pure harness reads; writes only --out.
import { writeFileSync } from "node:fs";
import { hashSeed } from "../../src/core/rng";
import { Battle } from "../../src/sim/battle";
import { STUN_CAUSES, type HeroId } from "../../src/sim/content";
import type { Build } from "../../src/sim/deck";
import { setEnchant } from "../../src/sim/enchant";
import { parField } from "../../src/sim/harness/par";
import { stunsPerFight } from "../../src/sim/harness/enchantBot";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DAYS = arg("--days", "5,10").split(",").map(Number).filter(Boolean);
const K = Number(arg("--k", "24")), OPP = Number(arg("--opp", "6"));
const OUT = arg("--out", "stuns.json");
const ALL: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const HEROES = (process.argv.includes("--hero") ? arg("--hero", "furnace") : arg("--heroes", ALL.join(","))).split(",").filter(Boolean) as HeroId[];

setEnchant(false); // no deck holds a word: the stuns a plain deck meets

const t0 = Date.now();
const rows: Record<string, unknown>[] = [];
for (const day of DAYS) {
  const fields = new Map<HeroId, Build[]>(ALL.map((h) => [h, parField(h, day, K)]));
  for (const hero of HEROES) {
    const mine = fields.get(hero)!;
    const oppField = ALL.filter((h) => h !== hero).flatMap((h) => fields.get(h)!.map((deck) => ({ hero: h, deck })));
    const kinds: Record<string, number> = {};
    let battles = 0, stuns = 0, withStun = 0, withPiece = 0, fightSecs = 0, pieceStuns = 0;
    mine.forEach((a, idx) => {
      for (let j = 0; j < OPP; j++) {
        const o = oppField[(idx * 7 + j * 3 + j) % oppField.length];
        const seed = hashSeed("e1stuns", day, hero, idx, j);
        for (const side of [0, 1] as const) {
          const b = side === 0 ? new Battle(a, o.deck, seed, undefined, day) : new Battle(o.deck, a, seed, undefined, day);
          let n = 0, np = 0;
          while (!b.over && b.ticks < 60 * 200) {
            b.step();
            for (const ev of b.events) {
              if (ev.type !== "harass" || ev.side !== side || !STUN_CAUSES.includes(ev.cause)) continue;
              n++;
              kinds[ev.kind] = (kinds[ev.kind] ?? 0) + 1;
              if (ev.kind === "gate" || ev.kind === "factory" || ev.kind === "turret") np++;
            }
            b.events.length = 0;
          }
          battles++;
          stuns += n;
          pieceStuns += np;
          fightSecs += b.t;
          if (n > 0) withStun++;
          if (np > 0) withPiece++;
        }
      }
    });
    const per = (x: number): number => x / battles;
    const row = {
      day, hero, decks: mine.length, battles, stunsPerFight: per(stuns), onPiecesPerFight: per(pieceStuns), fightsWithAStun: withStun / battles, fightsWithAStunOnAPiece: withPiece / battles,
      byKind: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, per(v)])), meanFightSeconds: fightSecs / battles, botGuess: stunsPerFight(day),
    };
    rows.push(row);
    console.log(`stuns d${day} ${hero.padEnd(8)} ${battles} battles: ${row.stunsPerFight.toFixed(2)} stuns a fight (${row.onPiecesPerFight.toFixed(2)} on a rig, factory or turret; ${(100 * row.fightsWithAStunOnAPiece).toFixed(0)}% of fights have one), by kind ${JSON.stringify(row.byKind, (_k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v))}; the bots' guess ${row.botGuess} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
writeFileSync(OUT, JSON.stringify({ label: "ENCHANT off (plain decks), par fields, k " + K + ", " + OPP + " opponents a deck, both sides, with SHAPES2, PLAIN_RIGS and LONG_RUN as bump-accepted ships them, before BUMP-1E's scaling flip", days: DAYS, rows, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
console.log(`stuns: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
