// SCALE-2e E3 (REQ-BFG-108, REQ-BFG-098 098.3; BRIEF-SCALE2e section 2; REPORT-SCALE1 section 2, GENRE-2's three checks):
// POISON's bench, on the pairs bench's tools (tools/scale2e/pairs.ts: par bases plus FREE parts placed where the par player
// would place them, switch on, the run's counts in every duel). One process a day. Decks (all parts at the day's star --star,
// except as named):
//   POISON  a par base of each of the four heroes + 2 VENOM DRIP + ROT GAUGE + LEECH COIL
//   WALL    a BASTION par base + 2 PLATE ROLLER + ARMOR PRESS (the SHIELD wall; "PLATE" is the old name of SHIELD)
//   BURN    a FURNACE par base + 2 TEMPER ★2 + KINDLING (the fast BURN deck)
//   HEAL-A / HEAL-B   a par base + 2 VENOM DRIP + LEECH COIL + MENDING LOOM / MEND PRESS
// Check 1: POISON beats the WALL at least 55% of the battles (the same bases without the POISON parts, against the same walls,
//          are the control). Check 2: POISON against BURN wins at most 45% of the battles that end before 15 s and at least 55%
//          of those that run past 25 s. Check 3: HEAL-A and HEAL-B against the par fields of all four heroes: under 1% of
//          battles pass 60 s, none reaches the 120 s stop, and the median battle is within 20% of the plain bases' against the
//          same foes. Every battle is played from both sides, --seeds seeds a pairing, on the day's rules.
// Usage: node <built>/poison.js --day 6 --k 6 --kw 8 --m 6 --seeds 4 --out file.json
import { writeFileSync } from "node:fs";
import type { HeroId } from "../../src/sim/content";
import { simulate } from "../../src/sim/battle";
import { cloneBuild, type Build } from "../../src/sim/deck";
import { hashSeed, Rng } from "../../src/core/rng";
import { newRun } from "../../src/game/run";
import { scaleRules } from "../../src/sim/scale";
import { parField } from "../../src/sim/harness/par";
import { placeFreePart } from "../../src/sim/harness/player";
import { jobCounts, type Job } from "../../src/sim/harness/tournament";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DAY = Number(arg("--day", "6"));
const K = Number(arg("--k", "6")), KW = Number(arg("--kw", "8")), M = Number(arg("--m", "6")), SEEDS = Number(arg("--seeds", "4"));
const STAR = Number(arg("--star", String(DAY <= 4 ? 1 : DAY <= 7 ? 2 : 3)));
const OUT = arg("--out", `poison-d${DAY}.json`);
const CHECKS = arg("--checks", "1,2,3").split(",");
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const log = (s: string): void => console.log(`poison d${DAY} ★${STAR}: ${s}`);
if (!scaleRules()) { console.error("poison.ts: SCALE_RIGS is off in this build (set the constant true in the export)"); process.exit(3); }

type Part = [id: string, copies: number, stars?: number];
function addPart(hero: HeroId, board: Build, def: string, stars: number, key: string): Build | null {
  const run = newRun(hero, hashSeed("scale2e-poison-run", hero, DAY, key), `s2e-poison-${hero}-${DAY}`);
  run.build = cloneBuild(board);
  run.day = DAY;
  run.gold = 0;
  const uids = [...board.items, ...board.mods, ...(board.turrets ?? [])].map((p) => p.uid);
  run.nextUid = Math.max(100, ...uids) + 1;
  const r = placeFreePart(run, def, new Rng(hashSeed("scale2e-poison-place", hero, DAY, key, def)), undefined, stars);
  return r.placed ? run.build : null;
}
function assemble(hero: HeroId, base: Build, parts: Part[], key: string): Build | null {
  let b: Build | null = base;
  for (const [id, n, st] of parts) for (let c = 0; c < n && b; c++) b = addPart(hero, b, id, st ?? STAR, `${key}|${id}${c}`);
  return b;
}
const holds = (b: Build, ids: string[]): boolean => ids.some((id) => b.items.some((p) => p.def === id) || b.mods.some((m) => m.def === id));

interface Battle1 { t: number; pts: number } // pts: 1 win, 0.5 draw, 0 loss, from the first deck's side
/** Every battle of deck `a` (index ia) against deck `b` (index ib): a's points and the fight length, both sides, SEEDS seeds. */
function duel(a: Build, b: Build, key: string): Battle1[] {
  const out: Battle1[] = [];
  for (let s = 0; s < SEEDS; s++) {
    const seed = hashSeed("scale2e-poison", DAY, key, s);
    const job: Job = { a: 0, b: 1, seeds: [seed], day: DAY };
    const cx = jobCounts(job, seed), cy = jobCounts(job, seed, true);
    const x = simulate(a, b, seed, undefined, cx.wins, DAY, cx.lost);
    const y = simulate(b, a, seed, undefined, cy.wins, DAY, cy.lost);
    out.push({ t: x.t, pts: x.winner === 0 ? 1 : x.winner === -1 ? 0.5 : 0 }, { t: y.t, pts: y.winner === 1 ? 1 : y.winner === -1 ? 0.5 : 0 });
  }
  return out;
}
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

const t0 = Date.now();
const fields = new Map<HeroId, Build[]>(HEROES.map((h) => [h, parField(h, DAY, Math.max(K + 6, KW + 4, M))]));
log(`par fields built in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const POISONP: Part[] = [["venom", 2], ["rotgauge", 1], ["leechcoil", 1]];
const PURE = ["venom", "rotgauge", "leechcoil"];

// bases that hold no POISON part; the decks
const bases: { hero: HeroId; i: number; b: Build }[] = [];
for (const h of HEROES) {
  let n = 0;
  for (let i = 0; i < fields.get(h)!.length && n < K; i++) { const b = fields.get(h)![i]; if (holds(b, PURE)) continue; bases.push({ hero: h, i, b }); n++; }
}
const poisonDecks = bases.map((x) => ({ ...x, d: assemble(x.hero, x.b, POISONP, `P|${x.hero}|${x.i}`) })).filter((x): x is typeof x & { d: Build } => !!x.d);
const healA = bases.map((x) => ({ ...x, d: assemble(x.hero, x.b, [["venom", 2], ["leechcoil", 1], ["mendingloom", 1]], `HA|${x.hero}|${x.i}`) })).filter((x): x is typeof x & { d: Build } => !!x.d);
const healB = bases.map((x) => ({ ...x, d: assemble(x.hero, x.b, [["venom", 2], ["leechcoil", 1], ["mendpress", 1]], `HB|${x.hero}|${x.i}`) })).filter((x): x is typeof x & { d: Build } => !!x.d);
const walls: Build[] = [];
for (let i = 0; i < fields.get("bastion")!.length && walls.length < KW; i++) {
  const b = fields.get("bastion")![i];
  const w = assemble("bastion", b, [["plateroller", 2], ["armorpress", 1]], `W|${i}`);
  if (w) walls.push(w);
}
const burns: Build[] = [];
for (let i = 0; i < fields.get("furnace")!.length && burns.length < KW; i++) {
  const b = fields.get("furnace")![i];
  const w = assemble("furnace", b, [["temper", 2, 2], ["quench", 1]], `B|${i}`);
  if (w) burns.push(w);
}
log(`decks: ${poisonDecks.length} POISON, ${healA.length} HEAL-A, ${healB.length} HEAL-B, ${walls.length} WALL, ${burns.length} BURN (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

const out: Record<string, unknown> = { day: DAY, star: STAR, k: K, kw: KW, m: M, seeds: SEEDS, decks: { poison: poisonDecks.length, healA: healA.length, healB: healB.length, walls: walls.length, burns: burns.length } };

// check 1: POISON against the WALL (and the plain bases against the same walls: the control)
if (CHECKS.includes("1")) {
  const per: number[] = [], ctrl: number[] = [];
  walls.forEach((w, wi) => {
    poisonDecks.forEach((p, pi) => {
      const r = duel(p.d, w, `c1|${pi}|${wi}`);
      per.push(...r.map((x) => x.pts));
      const c = duel(p.b, w, `c1c|${pi}|${wi}`);
      ctrl.push(...c.map((x) => x.pts));
    });
  });
  const c1 = { battles: per.length, win: mean(per), control: mean(ctrl), pass: mean(per) >= 0.55 };
  out.check1 = c1;
  log(`check 1 POISON vs WALL: ${(100 * c1.win).toFixed(1)}% of ${c1.battles} battles (bar >= 55%); the same bases without POISON: ${(100 * c1.control).toFixed(1)}% -> ${c1.pass ? "PASS" : "FAIL"}`);
}
// check 2: POISON against BURN by the length of the fight (and the plain bases against the same BURN decks: the control)
if (CHECKS.includes("2")) {
  const all: Battle1[] = [];
  const ctrl: Battle1[] = [];
  burns.forEach((bu, bi) => poisonDecks.forEach((p, pi) => { all.push(...duel(p.d, bu, `c2|${pi}|${bi}`)); ctrl.push(...duel(p.b, bu, `c2c|${pi}|${bi}`)); }));
  const early = all.filter((x) => x.t < 15), late = all.filter((x) => x.t > 25);
  const c2 = {
    battles: all.length, all: mean(all.map((x) => x.pts)), control: mean(ctrl.map((x) => x.pts)), controlMedian: median(ctrl.map((x) => x.t)), median: median(all.map((x) => x.t)),
    over20: all.filter((x) => x.t > 20).length, winOver20: mean(all.filter((x) => x.t > 20).map((x) => x.pts)),
    under15: early.length, winUnder15: mean(early.map((x) => x.pts)), over25: late.length, winOver25: mean(late.map((x) => x.pts)),
    bins: [0, 10, 15, 20, 25, 30, 40, 60, 200].slice(0, -1).map((lo, k) => { const hi = [10, 15, 20, 25, 30, 40, 60, 200][k]; const xs = all.filter((x) => x.t >= lo && x.t < hi); return { from: lo, to: hi, n: xs.length, win: mean(xs.map((x) => x.pts)) }; }),
    pass: false,
  };
  c2.pass = c2.winUnder15 <= 0.45 && c2.winOver25 >= 0.55;
  out.check2 = c2;
  log(`check 2 POISON vs BURN: all ${(100 * c2.all).toFixed(1)}% of ${c2.battles} (median ${c2.median.toFixed(1)} s; the same bases without POISON ${(100 * c2.control).toFixed(1)}%, median ${c2.controlMedian.toFixed(1)} s); past 20 s ${(100 * c2.winOver20).toFixed(1)}% of ${c2.over20}; under 15 s ${(100 * c2.winUnder15).toFixed(1)}% of ${c2.under15} (bar <= 45%); past 25 s ${(100 * c2.winOver25).toFixed(1)}% of ${c2.over25} (bar >= 55%) -> ${c2.pass ? "PASS" : "FAIL"}`);
}
// check 3: no heal stall, against the par fields of every hero
if (CHECKS.includes("3")) {
  const foes: Build[] = HEROES.flatMap((h) => fields.get(h)!.slice(0, M));
  const run = (decks: { b: Build; d: Build }[], tag: string): { ts: number[]; pts: number[] } => {
    const ts: number[] = [], pts: number[] = [];
    decks.forEach((p, pi) => foes.forEach((f, fi) => { if (f === p.b) return; for (const x of duel(p.d, f, `c3|${tag}|${pi}|${fi}`)) { ts.push(x.t); pts.push(x.pts); } }));
    return { ts, pts };
  };
  const plain = run(bases.map((x) => ({ b: x.b, d: x.b })), "plain");
  const rows: Record<string, unknown> = { plain: { battles: plain.ts.length, median: median(plain.ts), over60: plain.ts.filter((t) => t > 60).length, win: mean(plain.pts) } };
  let pass = true;
  for (const [tag, set] of [["healA", healA], ["healB", healB]] as const) {
    const r = run(set.map((x) => ({ b: x.b, d: x.d })), tag);
    const med = median(r.ts), share60 = r.ts.filter((t) => t > 60).length / r.ts.length, at120 = r.ts.filter((t) => t >= 119.9).length;
    const dev = med / (rows.plain as { median: number }).median - 1;
    const ok = share60 < 0.01 && at120 === 0 && Math.abs(dev) <= 0.2;
    pass = pass && ok;
    rows[tag] = { battles: r.ts.length, median: med, medianVsPlain: dev, over60: r.ts.filter((t) => t > 60).length, share60, at120, max: Math.max(...r.ts), win: mean(r.pts), pass: ok };
    log(`check 3 ${tag}: median ${med.toFixed(1)} s (plain ${(rows.plain as { median: number }).median.toFixed(1)} s, ${(100 * dev).toFixed(0)}%); past 60 s ${(100 * share60).toFixed(2)}% (${r.ts.filter((t) => t > 60).length} of ${r.ts.length}); at 120 s ${at120}; longest ${Math.max(...r.ts).toFixed(1)} s; win ${(100 * mean(r.pts)).toFixed(1)}% -> ${ok ? "PASS" : "FAIL"}`);
  }
  out.check3 = { ...rows, pass };
}
// check 4 (G4, REPORT-SCALE1 section 4: each pair wins at most 50% against its named answer): the pair decks of the readers whose
// answer is a deck this file builds -- KINDLING + 2 TEMPER against the SHIELD wall; CINDER MAIL + 2 TEMPER and IRON WALL + 2 PLATE
// ROLLER against a POISON deck ("past SHIELD"); ROT GAUGE + VENOM DRIP and LEECH COIL + VENOM DRIP against the fast BURN deck
// (and, for them, in the fights under 15 s). The pair is built on each hero's par bases (as the pairs bench builds it).
if (CHECKS.includes("4")) {
  const PAIRS4: { tag: string; parts: Part[]; foes: Build[]; foe: string }[] = [
    { tag: "KINDLING + 2 TEMPER", parts: [["temper", 2], ["quench", 1]], foes: walls, foe: "SHIELD wall" },
    { tag: "CINDER MAIL + 2 TEMPER", parts: [["temper", 2], ["cindermail", 1]], foes: poisonDecks.map((x) => x.d), foe: "POISON deck" },
    { tag: "IRON WALL + 2 PLATE ROLLER", parts: [["plateroller", 2], ["shieldwall", 1]], foes: poisonDecks.map((x) => x.d), foe: "POISON deck" },
    { tag: "ROT GAUGE + VENOM DRIP", parts: [["venom", 1], ["rotgauge", 1]], foes: burns, foe: "fast BURN deck" },
    { tag: "LEECH COIL + VENOM DRIP", parts: [["venom", 1], ["leechcoil", 1]], foes: burns, foe: "fast BURN deck" },
  ];
  const rows: unknown[] = [];
  for (const q of PAIRS4) {
    const decks = bases.map((x) => ({ x, d: assemble(x.hero, x.b, q.parts, `G4|${q.tag}|${x.hero}|${x.i}`) })).filter((y): y is { x: typeof bases[number]; d: Build } => !!y.d);
    const all: Battle1[] = [];
    decks.forEach((y, yi) => q.foes.forEach((f, fi) => all.push(...duel(y.d, f, `c4|${q.tag}|${yi}|${fi}`))));
    const u15 = all.filter((z) => z.t < 15);
    const r = { pair: q.tag, answer: q.foe, decks: decks.length, battles: all.length, win: mean(all.map((z) => z.pts)), under15: u15.length, winUnder15: mean(u15.map((z) => z.pts)), median: median(all.map((z) => z.t)) };
    rows.push(r);
    log(`check 4 (G4) ${q.tag} vs ${q.foe}: ${(100 * r.win).toFixed(1)}% of ${r.battles} battles (${r.decks} decks; bar <= 50%); under 15 s ${(100 * r.winUnder15).toFixed(1)}% of ${r.under15}; median fight ${r.median.toFixed(1)} s`);
  }
  out.check4 = rows;
}
out.seconds = Math.round((Date.now() - t0) / 1000);
writeFileSync(OUT, JSON.stringify(out, null, 1));
log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
