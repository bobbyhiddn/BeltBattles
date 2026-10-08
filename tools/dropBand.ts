// HULL-1b (REQ-BFG-078; REVIEW-NPC1 ruling Q2; cap's answer 98fa8a5115ab780f item 5): the drop band, exact (no bench).
// New; tools/ is outside the fingerprint. NPC-1's method (road.ts expectedRoadValue): a win's expected road value by tier
// on days 1-10 = gold + chance x the sum of odds x valueOf(def, the drop's star), the mean over the tier's captains
// (warlordPool), unsabotaged, a win assumed. It prints:
//  1. the live table (npcDay.ts DROP_CHANCE, DROP_WEIGHTS, DROP_STARS) by tier and day, checked against road.ts
//     expectedRoadValue to 1e-9, with Hard/Medium and Medium/Easy per day, and 0.9.7's Hard (road.ts roadValue097);
//  2. THE BAND (cap's ruling Q2): on every day 3-10 a Hard win is 1.25x-1.6x a Medium win: IN BAND or OUT, the worst day
//     and its margin; Medium/Easy above 1 on days 3-10;
//  3. the levers from NPC-1's start numbers (Hard 90%, turret/epic/rare/common 2/2/3/3, ★1), in the ruling's order:
//     Hard's chance to 100%, Hard drops at ★2, the Hard tilt (every integer weight 1..12 with turrets <= common rigs, the
//     operator's shape) alone and together, and the one-weight moves at ★2; and the next fallback (common 6).
// Exit 1 when the live numbers are out of the band (HULL-1c reruns it after the warlord re-fit).
//   npx vite build --ssr tools/dropBand.ts --outDir tools/dist/dropband --emptyOutDir --logLevel warn
//   node tools/dist/dropband/dropBand.js [--no-search]

import { expectedRoadValue, rewardGold, roadValue097, warlordDeck } from "../src/game/road";
import { DROP_CHANCE, DROP_STARS, DROP_WEIGHTS, dropClass, dropPool, withNpcDay, type DropClass } from "../src/sim/npcDay";
import { warlordPool, type Difficulty } from "../src/sim/rivals";
import { valueOf } from "../src/sim/stars";

type W = Record<DropClass, number>;
const CLS: DropClass[] = ["turret", "epic", "rare", "common"];
const DAYS = Array.from({ length: 10 }, (_, i) => i + 1);
const BAND_DAYS = DAYS.slice(2);
const LO = 1.25, HI = 1.6;
/** NPC-1's start numbers for Hard (npc1-accepted c05c286). */
const START = { chance: 0.9, w: { turret: 2, epic: 2, rare: 3, common: 3 } as W, star: 1 };

/** Per (tier, day): each captain's non-empty classes, with the mean 1-star value of their parts. */
const cache = new Map<string, { c: DropClass; mean: number }[][]>();
function pools(day: number, tier: Difficulty): { c: DropClass; mean: number }[][] {
  const k = `${tier}|${day}`;
  if (!cache.has(k)) cache.set(k, warlordPool(tier).map((id) => {
    const pool = dropPool(warlordDeck(id, day));
    return CLS.map((c) => ({ c, defs: pool.filter((d) => dropClass(d) === c) })).filter((x) => x.defs.length)
      .map((x) => ({ c: x.c, mean: x.defs.reduce((s, d) => s + valueOf(d, 1), 0) / x.defs.length }));
  }));
  return cache.get(k)!;
}

/** A tier's mean win value on `day`: gold + chance x sum(odds x valueOf(def, star)) (valueOf doubles a star). */
function ev(day: number, tier: Difficulty, chance: number, w: W, star: number): number {
  const ps = pools(day, tier);
  let sum = 0;
  for (const classes of ps) {
    const total = classes.reduce((s, x) => s + w[x.c], 0);
    let drop = 0;
    for (const x of classes) drop += ((chance * w[x.c]) / total) * x.mean * 2 ** (star - 1);
    sum += rewardGold(tier, day) + (total > 0 ? drop : 0);
  }
  return sum / ps.length;
}

const live = (tier: Difficulty) => ({ chance: DROP_CHANCE[tier], w: { ...DROP_WEIGHTS[tier] } as W, star: DROP_STARS[tier] });
const medium = DAYS.map((d) => ev(d, "medium", DROP_CHANCE.medium, { ...DROP_WEIGHTS.medium } as W, DROP_STARS.medium));
const easy = DAYS.map((d) => ev(d, "easy", DROP_CHANCE.easy, { ...DROP_WEIGHTS.easy } as W, DROP_STARS.easy));
function band(chance: number, w: W, star: number) {
  const r = BAND_DAYS.map((d) => ev(d, "hard", chance, w, star) / medium[d - 1]);
  return { r, lo: Math.min(...r), hi: Math.max(...r), ok: r.every((x) => x >= LO && x <= HI) };
}
const wtxt = (w: W) => `${w.turret}/${w.epic}/${w.rare}/${w.common}`;
function show(name: string, chance: number, w: W, star: number): ReturnType<typeof band> {
  const b = band(chance, w, star);
  console.log(`${name.padEnd(22)} chance ${chance}, t/e/r/c ${wtxt(w)}, ★${star}: Hard/Medium d3-10 ${b.r.map((x) => x.toFixed(3)).join(" ")} (${b.lo.toFixed(3)}-${b.hi.toFixed(3)}) ${b.ok ? "IN BAND" : "out"}`);
  return b;
}

function main(): number {
  return withNpcDay(() => {
    // 1. the live table, checked against the game's own function
    const rows: Record<string, number[]> = {};
    for (const t of ["easy", "medium", "hard"] as Difficulty[]) {
      const L = live(t);
      rows[t] = DAYS.map((d) => ev(d, t, L.chance, L.w, L.star));
      DAYS.forEach((d, i) => {
        const g = expectedRoadValue(d, t);
        if (Math.abs(g - rows[t][i]) > 1e-9) throw new Error(`dropBand: ${t} day ${d}: ${rows[t][i]} vs road.ts expectedRoadValue ${g}`);
      });
    }
    rows.matriarch = DAYS.map((d) => expectedRoadValue(d, "matriarch"));
    rows["hard, 0.9.7's pick of 2"] = DAYS.map((d) => roadValue097(d, "hard"));
    console.log(`live numbers: chance ${JSON.stringify(DROP_CHANCE)}; weights t/e/r/c Easy ${wtxt(DROP_WEIGHTS.easy as W)}, Medium ${wtxt(DROP_WEIGHTS.medium as W)}, Hard ${wtxt(DROP_WEIGHTS.hard as W)}; stars ${JSON.stringify(DROP_STARS)} (each value = road.ts expectedRoadValue, to 1e-9)`);
    console.log(`| tier | ${DAYS.map((d) => `d${d}`).join(" | ")} |`);
    console.log(`|---|${DAYS.map(() => "---").join("|")}|`);
    for (const t of ["easy", "medium", "hard", "matriarch", "hard, 0.9.7's pick of 2"]) console.log(`| ${t} | ${rows[t].map((v) => v.toFixed(2)).join(" | ")} |`);
    console.log(`| Hard/Medium | ${DAYS.map((_, i) => (rows.hard[i] / rows.medium[i]).toFixed(3)).join(" | ")} |`);
    console.log(`| Medium/Easy | ${DAYS.map((_, i) => (rows.medium[i] / rows.easy[i]).toFixed(3)).join(" | ")} |`);
    // 2. the band
    const L = live("hard");
    const b = band(L.chance, L.w, L.star);
    const worst = b.r.reduce((m, x, i) => (Math.min(HI - x, x - LO) < Math.min(HI - b.r[m], b.r[m] - LO) ? i : m), 0);
    const me = BAND_DAYS.map((d) => medium[d - 1] / easy[d - 1]);
    console.log(`\nTHE BAND (Hard/Medium ${LO}-${HI} on days 3-10): ${b.ok ? "IN BAND" : "OUT"}; ${b.lo.toFixed(3)}-${b.hi.toFixed(3)}; the closest day is ${BAND_DAYS[worst]} at ${b.r[worst].toFixed(3)} (${(Math.min(HI - b.r[worst], b.r[worst] - LO)).toFixed(3)} from the edge)`);
    console.log(`Medium/Easy on days 3-10: ${me.map((x) => x.toFixed(3)).join(" ")} (${me.every((x) => x > 1) ? "Medium the richer every day" : "NOT richer every day"})`);
    // 3. the levers from NPC-1's start numbers
    if (!process.argv.includes("--no-search")) {
      console.log(`\nthe levers from NPC-1's start numbers (Hard ${START.chance}, ${wtxt(START.w)}, ★${START.star}), in the ruling's order:`);
      show("start", START.chance, START.w, 1);
      show("1: 100%", 1, START.w, 1);
      show("2: ★2", START.chance, START.w, 2);
      show("1+2", 1, START.w, 2);
      const share = (w: W) => { const s = CLS.reduce((a, c) => a + w[c], 0); return CLS.map((c) => w[c] / s); };
      const s0 = share(START.w);
      for (const [name, chance, star] of [["3: tilt", START.chance, 1], ["1+3", 1, 1], ["2+3", START.chance, 2], ["1+2+3", 1, 2]] as [string, number, number][]) {
        let n = 0, best: { w: W; d: number } | null = null;
        for (let t = 1; t <= 12; t++) for (let e = 1; e <= 12; e++) for (let r = 1; r <= 12; r++) for (let c = t; c <= 12; c++) {
          const w: W = { turret: t, epic: e, rare: r, common: c };
          if (!band(chance, w, star).ok) continue;
          n++;
          const d = share(w).reduce((a, x, i) => a + Math.abs(x - s0[i]), 0);
          if (!best || d < best.d - 1e-12) best = { w, d };
        }
        if (best) show(`${name}: ${n} tilts; nearest`, chance, best.w, star);
        else console.log(`${name.padEnd(22)} no tilt (weights 1..12, turrets <= common rigs) meets the band`);
      }
      console.log("one weight moved at ★2, chance 0.9 (the chosen lever set):");
      for (const c0 of CLS) for (let v = 1; v <= 12; v++) {
        const w: W = { ...START.w, [c0]: v };
        if (v === START.w[c0] || w.turret > w.common) continue;
        const x = band(START.chance, w, 2);
        if (x.ok) console.log(`  ${c0} ${START.w[c0]} -> ${v}: ${x.lo.toFixed(3)}-${x.hi.toFixed(3)} IN BAND`);
      }
      show("fallback: common 6", START.chance, { ...START.w, common: 6 }, 2);
    }
    return b.ok ? 0 : 1;
  });
}

if (process.argv[1]?.endsWith("dropBand.js")) process.exitCode = main();
