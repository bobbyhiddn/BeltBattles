// ENCHANT-1 step 9b (REQ-BFG-085 (6), REQ-BFG-056 the pillar; BRIEF-ENCHANT1 E9b): THE GODS CHECK. A day-10 deck with 3 words on ★2-★3 pieces
// beats the same deck without them by 15 points or more (depth: the words must matter when they stack). For each hero: the par field of
// day 10 (parField, made with ENCHANT OFF: no words), each deck dressed with up to `--n` (3) words, chosen greedily by the bots' valuation
// (enchantBot.ts rankWords over every word, the best pair first, one word a piece, ★2-★3 pieces only by default); the plain deck and its
// dressed twin play the SAME battles (opponents from the other heroes' plain fields, the same seeds, both sides). Reported per hero: the
// win points gained; and par's MEAN FIGHT LENGTH on and off (REQ-BFG-079): the mean battle time of the plain decks' battles against the
// dressed decks' battles (flag a move over 2 s).
// Usage: node <built>/gods.js --day 10 --n 3 --stars 23 --k 96 --opp 12 --out gods.json [--hero furnace]
// Pure harness reads; writes only --out.
import { writeFileSync } from "node:fs";
import { hashSeed } from "../../src/core/rng";
import { simulate } from "../../src/sim/battle";
import type { HeroId } from "../../src/sim/content";
import { cloneBuild, setTurretList, turretList, type Build } from "../../src/sim/deck";
import { ENCHANT_IDS, setEnchant, type EnchantId } from "../../src/sim/enchant";
import { parField } from "../../src/sim/harness/par";
import { piecesOf, rankWords, type WordSpot } from "../../src/sim/harness/enchantBot";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DAY = Number(arg("--day", "10"));
const N = Number(arg("--n", "3"));
const STARS = Number(arg("--stars", "23")); // 0 any, 1 only ★1, 23 only ★2-★3
const K = Number(arg("--k", "24")), OPP = Number(arg("--opp", "6"));
const OUT = arg("--out", "gods.json");
const ALL: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const HEROES = (process.argv.includes("--hero") ? arg("--hero", "furnace") : arg("--heroes", ALL.join(","))).split(",").filter(Boolean) as HeroId[];

setEnchant(false);
const fields = new Map<HeroId, Build[]>(ALL.map((h) => [h, parField(h, DAY, K)]));
setEnchant(true);

const okStars = (stars: number): boolean => (STARS === 0 ? true : STARS === 1 ? stars === 1 : stars >= 2);
const keyOf = (t: WordSpot["target"]): string => (t.kind === "item" ? `i${t.uid}` : `t${t.slot}`);

/** Up to N words on N different pieces, the best (word, piece) pair first, re-ranked on the dressed deck after each. */
function dressGreedy(b: Build): { deck: Build; words: { word: EnchantId; def: string; value: number }[] } {
  let d = cloneBuild(b);
  const used = new Set<string>(), words: { word: EnchantId; def: string; value: number }[] = [];
  for (let n = 0; n < N; n++) {
    const stars = new Map(piecesOf(d).map((p) => [keyOf(p.target), p.stars] as const));
    let best: { word: EnchantId; spot: WordSpot } | null = null;
    for (const word of ENCHANT_IDS) {
      for (const spot of rankWords({ build: d, day: DAY }, word)) {
        const k = keyOf(spot.target);
        if (used.has(k) || spot.replaces || !okStars(stars.get(k) ?? 1)) continue;
        if (!best || spot.value > best.spot.value) best = { word, spot };
        break;
      }
    }
    if (!best) break;
    used.add(keyOf(best.spot.target));
    words.push({ word: best.word, def: best.spot.def, value: best.spot.value });
    d = cloneBuild(d);
    const grow = best.word === "growing" ? Math.max(0, DAY - 3) : 0;
    if (best.spot.target.kind === "item") {
      const uid = best.spot.target.uid, p = d.items.find((q) => q.uid === uid)!;
      p.ench = best.word;
      if (best.word === "wide" && best.spot.dir !== undefined) p.enchDir = best.spot.dir;
      if (grow > 0) p.grow = grow;
    } else {
      const slot = best.spot.target.slot, tl = turretList(d), t = tl.find((x) => x.slot === slot)!;
      t.ench = best.word;
      if (grow > 0) t.grow = grow;
      setTurretList(d, tl);
    }
  }
  return { deck: d, words };
}

interface Out { pts: number; secs: number; battles: number }
function play(a: Build, hero: HeroId, idx: number, oppField: { hero: HeroId; deck: Build }[]): Out {
  let pts = 0, secs = 0, battles = 0;
  for (let j = 0; j < OPP; j++) {
    const o = oppField[(idx * 7 + j * 3) % oppField.length];
    const seed = hashSeed("e1gods", DAY, hero, idx, j);
    const b0 = simulate(a, o.deck, seed, undefined, undefined, DAY), b1 = simulate(o.deck, a, seed, undefined, undefined, DAY);
    pts += (b0.winner === 0 ? 1 : b0.winner === -1 ? 0.5 : 0) + (b1.winner === 1 ? 1 : b1.winner === -1 ? 0.5 : 0);
    secs += b0.t + b1.t;
    battles += 2;
  }
  return { pts, secs, battles };
}

const t0 = Date.now();
const label = `ENCHANT on, with SHAPES2, PLAIN_RIGS and LONG_RUN as bump-accepted ships them, before BUMP-1E's scaling flip; day ${DAY}, ${N} words on pieces at stars ${STARS === 0 ? "any" : STARS === 1 ? "1" : "2-3"}, par field k ${K}, ${OPP} opponents a deck (both sides)`;
const rows: unknown[] = [];
for (const hero of HEROES) {
  const mine = fields.get(hero)!;
  const oppField = ALL.filter((h) => h !== hero).flatMap((h) => fields.get(h)!.map((deck) => ({ hero: h, deck })));
  let plainPts = 0, dressedPts = 0, plainSecs = 0, dressedSecs = 0, battles = 0, dressedDecks = 0, wordsPut = 0;
  const wordCounts: Record<string, number> = {};
  mine.forEach((d, i) => {
    const { deck, words } = dressGreedy(d);
    if (!words.length) return;
    dressedDecks++;
    wordsPut += words.length;
    for (const w of words) wordCounts[w.word] = (wordCounts[w.word] ?? 0) + 1;
    const a = play(d, hero, i, oppField), b = play(deck, hero, i, oppField);
    plainPts += a.pts; dressedPts += b.pts; plainSecs += a.secs; dressedSecs += b.secs; battles += a.battles;
  });
  const delta = battles ? (100 * (dressedPts - plainPts)) / battles : null;
  rows.push({ hero, decks: dressedDecks, of: mine.length, wordsPerDeck: dressedDecks ? wordsPut / dressedDecks : 0, deltaPoints: delta, plainWinRate: battles ? plainPts / battles : null, dressedWinRate: battles ? dressedPts / battles : null, meanFightSecsPlain: battles ? plainSecs / battles : null, meanFightSecsDressed: battles ? dressedSecs / battles : null, wordCounts });
  console.log(`gods d${DAY} ${hero.padEnd(8)} decks ${dressedDecks}/${mine.length} (${(dressedDecks ? wordsPut / dressedDecks : 0).toFixed(2)} words) delta ${delta === null ? "n/a" : delta.toFixed(1)} pts | fight ${battles ? (plainSecs / battles).toFixed(1) : "n/a"} s plain -> ${battles ? (dressedSecs / battles).toFixed(1) : "n/a"} s dressed | ${JSON.stringify(wordCounts)} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
writeFileSync(OUT, JSON.stringify({ label, day: DAY, n: N, stars: STARS, k: K, opp: OPP, rows, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
console.log(`gods: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
