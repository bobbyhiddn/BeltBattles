// ENCHANT-1 step 9a (REQ-BFG-085 (6); BRIEF-ENCHANT1 E9a): EACH WORD ON PAR'S BEST LEGAL PIECE, in par-field decks, per hero, on paired
// seeds. For a hero H and a day: the par field of H (parField(H, day, k), made with ENCHANT OFF, so no deck holds a word and none paid for
// one) is the plain field. For each word, each deck gets the word on the best legal piece the bots' valuation finds (enchantBot.ts
// rankWords: the top pair, optionally restricted to pieces at ★1 for the day-5 read or at ★2-★3 for the day-10 read; GROWING carries the
// counter a word bought on the first ENCHANTER day (3) would have: day - 3). The plain deck and its dressed twin then play THE SAME
// battles: opponents from the other three heroes' plain fields, the same seeds, each from both sides. The result is the dressed deck's
// win points minus the plain deck's, over the same battles (a draw counts a half), per word and hero, in win POINTS (percent).
// Target (E9a): +3 to +8 at ★1 on day 5. Over 8: cut the word's number (RISING's and GROWING's first), re-bench once; still over 10:
// STOP AND ASK. Under 3: raise it once; still under: report it.
// Usage: node <built>/words.js --day 5 --stars 1 --k 96 --opp 6 --out words-d5.json [--words fiery,rising] [--heroes furnace,weaver]
//        node <built>/words.js --day 10 --stars 23 ...      (stars 1 = only ★1 pieces, 23 = only ★2-★3 pieces, 0 = any piece)
// Pure harness reads; writes only --out. Label every read: "ENCHANT on, with SHAPES2, PLAIN_RIGS and LONG_RUN as bump-accepted ships them,
// before BUMP-1E's scaling flip". K/e1bench.sh builds and runs it (one process; `PERHERO=1` runs one process a hero with --heroes).
import { writeFileSync } from "node:fs";
import { hashSeed } from "../../src/core/rng";
import { simulate } from "../../src/sim/battle";
import type { HeroId } from "../../src/sim/content";
import { cloneBuild, setTurretList, turretList, type Build } from "../../src/sim/deck";
import { ENCHANT_IDS, setEnchant, type EnchantId } from "../../src/sim/enchant";
import { parField } from "../../src/sim/harness/par";
import { piecesOf, rankWords, type WordSpot } from "../../src/sim/harness/enchantBot";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DAY = Number(arg("--day", "5"));
const STARS = Number(arg("--stars", "0")); // 0: any, 1: only ★1 pieces, 23: only ★2-★3 pieces
const K = Number(arg("--k", "24")), OPP = Number(arg("--opp", "6"));
const OUT = arg("--out", `words-d${DAY}.json`);
const ALL: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const HEROES = arg("--heroes", ALL.join(",")).split(",").filter(Boolean) as HeroId[];
const WORDS = arg("--words", ENCHANT_IDS.join(",")).split(",").filter(Boolean) as EnchantId[];

// the plain fields first, with ENCHANT off (no word anywhere), for every hero (opponents come from the other heroes' fields)
setEnchant(false);
const fields = new Map<HeroId, Build[]>(ALL.map((h) => [h, parField(h, DAY, K)]));
setEnchant(true);

const okStars = (stars: number): boolean => (STARS === 0 ? true : STARS === 1 ? stars === 1 : stars >= 2);

/** The best legal spot for `word` on `b` at the stars asked, or null. */
function spotFor(b: Build, word: EnchantId): { spot: WordSpot; stars: number } | null {
  const stars = new Map<string, number>();
  for (const p of piecesOf(b)) stars.set(p.target.kind === "item" ? `i${p.target.uid}` : `t${p.target.slot}`, p.stars);
  for (const spot of rankWords({ build: b, day: DAY }, word)) {
    const st = stars.get(spot.target.kind === "item" ? `i${spot.target.uid}` : `t${spot.target.slot}`) ?? 1;
    if (okStars(st)) return { spot, stars: st };
  }
  return null;
}

/** A copy of `b` with `word` on `spot` (GROWING: the counter a word bought on day 3 has by DAY). */
function dress(b: Build, word: EnchantId, spot: WordSpot): Build {
  const d = cloneBuild(b);
  const grow = word === "growing" ? Math.max(0, DAY - 3) : 0;
  if (spot.target.kind === "item") {
    const uid = spot.target.uid, p = d.items.find((q) => q.uid === uid)!;
    p.ench = word;
    if (word === "wide" && spot.dir !== undefined) p.enchDir = spot.dir;
    if (grow > 0) p.grow = grow;
  } else {
    const slot = spot.target.slot, tl = turretList(d), t = tl.find((x) => x.slot === slot)!;
    t.ench = word;
    if (grow > 0) t.grow = grow;
    setTurretList(d, tl);
  }
  return d;
}

/** Points (win 1, draw 1/2) of `a` over its `n` battles against the field `opp`, each from both sides: the same battles for every deck of `a`'s twin. */
function points(a: Build, hero: HeroId, idx: number, seedsOf: number[], oppField: { hero: HeroId; deck: Build }[]): number {
  let pts = 0;
  seedsOf.forEach((s, j) => {
    const o = oppField[(idx * 7 + j * 3 + s) % oppField.length];
    const seed = hashSeed("e1words", DAY, hero, idx, j);
    const w0 = simulate(a, o.deck, seed, undefined, undefined, DAY).winner; // a as side 0
    const w1 = simulate(o.deck, a, seed, undefined, undefined, DAY).winner; // a as side 1
    pts += (w0 === 0 ? 1 : w0 === -1 ? 0.5 : 0) + (w1 === 1 ? 1 : w1 === -1 ? 0.5 : 0);
  });
  return pts;
}

const t0 = Date.now();
const label = `ENCHANT on, with SHAPES2, PLAIN_RIGS and LONG_RUN as bump-accepted ships them, before BUMP-1E's scaling flip; day ${DAY}, pieces at stars ${STARS === 0 ? "any" : STARS === 1 ? "1" : "2-3"}, par field k ${K}, ${OPP} opponents a deck (both sides)`;
const rows: unknown[] = [];
for (const hero of HEROES) {
  const mine = fields.get(hero)!;
  const oppField = ALL.filter((h) => h !== hero).flatMap((h) => fields.get(h)!.map((deck) => ({ hero: h, deck })));
  const seedsOf = Array.from({ length: OPP }, (_, j) => j);
  const base = mine.map((d, i) => points(d, hero, i, seedsOf, oppField));
  const baseTotal = base.reduce((a, b) => a + b, 0), battles = mine.length * OPP * 2;
  const per: Record<string, unknown> = {};
  for (const word of WORDS) {
    let dPts = 0, used = 0, botValue = 0;
    const kinds: Record<string, number> = {}, defs: Record<string, number> = {};
    mine.forEach((d, i) => {
      const sp = spotFor(d, word);
      if (!sp) return;
      used++;
      botValue += sp.spot.value;
      kinds[sp.spot.target.kind] = (kinds[sp.spot.target.kind] ?? 0) + 1;
      defs[sp.spot.def] = (defs[sp.spot.def] ?? 0) + 1;
      dPts += points(dress(d, word, sp.spot), hero, i, seedsOf, oppField) - base[i];
    });
    per[word] = { decks: used, of: mine.length, deltaPoints: used ? (100 * dPts) / (used * OPP * 2) : null, meanBotValue: used ? botValue / used : null, kinds, topDefs: Object.entries(defs).sort((x, y) => y[1] - x[1]).slice(0, 3) };
    console.log(`words d${DAY} ${hero.padEnd(7)} ${word.padEnd(8)} decks ${String(used).padStart(3)}/${mine.length} delta ${used ? ((100 * dPts) / (used * OPP * 2)).toFixed(1).padStart(6) : "   n/a"} pts (bot value ${used ? (botValue / used).toFixed(3) : "n/a"}) ${JSON.stringify(kinds)} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  rows.push({ hero, plainWinRate: baseTotal / battles, battles, per });
}
writeFileSync(OUT, JSON.stringify({ label, day: DAY, stars: STARS, k: K, opp: OPP, words: WORDS, rows, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
console.log(`words: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
