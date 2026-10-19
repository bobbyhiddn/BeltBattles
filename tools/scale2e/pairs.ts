// SCALE-2e E2/E3/E4 (REQ-BFG-098 098.3, REQ-BFG-108, REQ-BFG-110; BRIEF-SCALE2e sections 2 and 7): THE PAIRS BENCH for the 12
// scaling pieces, ported from SHAPES-1's presence bench (tools/shapes1/presence.ts). Run with SCALE_RIGS on (the export's one
// line set true: kit fpfinal.sh's edit), which also makes every bench duel carry the run's counts (E1: tournament.ts jobCounts).
//
// For one hero (--hero), one day (--day) and each reader (--readers): the bases are the hero's par decks (parField, seeds
// 1..--pool) that hold neither the reader nor any of its feeders (the first --k of them), each played against the par fields
// of the four heroes (each hero's first --m members; a deck never meets itself), --seeds seeds x both sides a pairing, on the
// day's rules. The variants, each a base deck plus FREE parts placed where the par player would place them (player.ts
// placeFreePart: a part judged at price 0, at the day's star --star, default 1 / 2 / 3 / 3 for days 3 / 6 / 9 / 10):
//   base      the deck as the par player built it
//   feeder    base + the reader's feeder copies (REPORT-SCALE1 3.3; READER_FEEDERS; "2 TEMPER", "2 PLATE ROLLER", ...)
//   pair      feeder + the reader                      pair lift   = pair - base
//   reader's lift = pair - feeder (REPORT-SCALE1 section 4: "the pair's lift minus the feeder's own lift")
//   temper    base + one TEMPER at the same star       the TEMPER line (PLAIN-1's guard: the plain rig the reader is held to)
// All variants of a base deck meet the same foes on the same seeds (paired fight for fight). Lifts are in win-rate points.
// Per variant and base deck it also keeps the fight lengths (base and pair; G5 and POISON's check 3).
// --poison (E3): the three checks of REPORT-SCALE1 section 2 instead (see poison() below).
// --set id=a,b,c (repeatable): the star numbers of a reader (ITEMS def patched AFTER the variant decks are built, so a tune
// is read on the very decks the shipped numbers were read on); --nojam off: PRESSURE BREECH without IT NEVER JAMS.
// Usage: node <built>/pairs.js --hero furnace --day 6 --k 16 --m 6 --seeds 2 --readers quench,cindermail --out file.json
// Pure harness reads; writes only --out and logs. No RNG beyond the game's seeded streams.
import { writeFileSync } from "node:fs";
import { ITEMS, type HeroId, type ItemDef } from "../../src/sim/content";
import { simulate } from "../../src/sim/battle";
import { cloneBuild, turretList, type Build } from "../../src/sim/deck";
import { hashSeed, Rng } from "../../src/core/rng";
import { newRun } from "../../src/game/run";
import { clearStarCache } from "../../src/sim/stars";
import { scaleRules, setScaleRigs } from "../../src/sim/scale";
import { READER_FEEDERS } from "../../src/sim/scaleRating";
import { parField } from "../../src/sim/harness/par";
import { placeFreePart } from "../../src/sim/harness/player";
import { jobCounts, type Job } from "../../src/sim/harness/tournament";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const HERO = arg("--hero", "furnace") as HeroId;
const DAY = Number(arg("--day", "6"));
const K = Number(arg("--k", "16")), M = Number(arg("--m", "6")), SEEDS = Number(arg("--seeds", "2")), POOL = Number(arg("--pool", "48"));
const STAR = Number(arg("--star", String(DAY <= 4 ? 1 : DAY <= 7 ? 2 : 3)));
const OUT = arg("--out", `pairs-${HERO}-d${DAY}.json`);
const ANSWERS = arg("--answers", "off") === "on";
const NOJAM_OFF = arg("--nojam", "on") === "off";
// --drake2 (E4, REQ-BFG-110): DRAKE NOZZLE in BOTH switch states on the very same decks (built with the switch off, fought off then on in one process)
const DRAKE2 = process.argv.includes("--drake2");
const FOES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const sets: string[] = [];
process.argv.forEach((a, i) => { if (a === "--set") sets.push(process.argv[i + 1]); });
// --cand "id=a,b,c;id2=d,e,f" (repeatable): star-number candidates read on the decks already built: for every row whose reader is
// named, the pair decks are fought again with the numbers patched (then put back); the row is written as "<tag> @<cand>"
const cands: string[] = [];
process.argv.forEach((a, i) => { if (a === "--cand") cands.push(process.argv[i + 1]); });
const log = (s: string): void => console.log(`pairs ${HERO} d${DAY} ★${STAR}: ${s}`);

// --allow-off: the DRAKE bench (group "drake") reads both switch states, so it runs on an export with the constant as shipped (false)
if (!scaleRules() && !process.argv.includes("--allow-off")) { console.error("pairs.ts: SCALE_RIGS is off in this build (set the constant true in the export, or pass --allow-off)"); process.exit(3); }

/** The pair of each reader: its feeder copies (id x n, at the day's star) and what else the pair holds (a rune). */
interface PairDef { reader: string; feeders: { id: string; n: number }[]; runes?: string[]; tag?: string; group?: string; need?: string[] }
const P = (reader: string, feeders: [string, number][] = [], extra: Partial<PairDef> = {}): PairDef => ({ reader, feeders: feeders.map(([id, n]) => ({ id, n })), ...extra });
const PAIRS: PairDef[] = [
  P("quench", [["temper", 2]]), // KINDLING with 2 TEMPER
  P("cindermail", [["temper", 2]]), // CINDER MAIL with 2 TEMPER
  P("pressure", [["splitter", 1]]), // PRESSURE BREECH with SPLITTER
  P("shieldwall", [["plateroller", 2]]), // IRON WALL with 2 PLATE ROLLER
  P("spallcatcher", [["plateroller", 2]]), // SPALL CATCHER with 2 PLATE ROLLER (it counts hits taken while living)
  P("keg", [["overclocker", 1]]), // POWDER KEG with OVERCLOCKER (hits twice)
  P("rotgauge", [["venom", 1]]), // ROT GAUGE with VENOM DRIP
  P("leechcoil", [["venom", 1]]), // LEECH COIL with VENOM DRIP
  P("crowdpress", [["shottower", 1]]), // CROWD PRESS with SHOT TOWER
  P("aegisspike", [["wardbell", 1]]), // AEGIS SPIKE with WARD BELL
  P("grudgerod"), // GRUDGE ROD: no feeder (the run's hearts lost, E1's run model)
  P("trophychain"), // TROPHY CHAIN: no feeder (the run's wins)
  // F3 (RETUNE-1's final GUARD): IRON WALL with the SHIELD runes, alone and with the roller pair
  P("shieldwall", [], { runes: ["rivet_hoard"], tag: "shieldwall+RIVET HOARD" }),
  P("shieldwall", [["plateroller", 2]], { runes: ["rivet_hoard"], tag: "shieldwall+2 PLATE ROLLER+RIVET HOARD" }),
  // SCALE-2b F7 (the multiplying sites): POISON never decays, so a SCATTER ceil, a MORTAR splash, a TESLA arc, a LANCE column or
  // MOLTEN VOWS' echo multiply a fight-long clock. The tested piece is VENOM DRIP (reader lift = pair - feeder = its lift with
  // the site), alone and with each site: asked for with --readers venom
  P("venom", [], { tag: "venom alone", group: "sites" }),
  P("venom", [["scatter", 1]], { tag: "venom+SCATTER CHOKE", group: "sites" }),
  P("venom", [["mortar", 1]], { tag: "venom+MORTAR TUBE", group: "sites" }),
  P("venom", [["tesla", 1]], { tag: "venom+TESLA ARC", group: "sites" }),
  P("venom", [["lance", 1]], { tag: "venom+LODESTAR LANCE", group: "sites" }),
  P("venom", [], { runes: ["molten_vows"], tag: "venom+MOLTEN VOWS", group: "sites" }),
  // REQ-BFG-110 / SCALE-2a F3 / REVIEW-SCALE1 F5 (DRAKE NOZZLE's guard): with the switch on DRAKE converts only the DMG from rigs'
  // stat rows, never a FOR EACH rig's DMG (LONG HAUL, PINCER, COUNTERWEIGHT, LODESTONE); off it converts all of it. Each rig alone and
  // with DRAKE on the same bases (the clean set excludes DRAKE and the rig in both rows); DRAKE alone. Run on both switch states
  // (--allow-off on an export with the constant as shipped), compare DRAKE's lift given the rig between the states.
  ...["longhaul", "pincer", "counterweight", "lodestone"].flatMap((x) => [
    P(x, [], { tag: `${x} alone`, group: "drake", need: ["drake"] }),
    P(x, [["drake", 1]], { tag: `${x}+DRAKE`, group: "drake" }),
  ]),
  P("drake", [], { tag: "drake alone", group: "drake", need: ["longhaul", "pincer", "counterweight", "lodestone"] }),
  // the CINDER MAIL stack (CM + 2 TEMPER, and with the rune and the rollers) places on few decks (1 of 4 on weaver d6): asked for by tag only
  P("shieldwall", [["cindermail", 1], ["temper", 2]], { tag: "shieldwall+CINDER MAIL+2 TEMPER", group: "cm" }),
  P("shieldwall", [["cindermail", 1], ["temper", 2], ["plateroller", 2]], { runes: ["rivet_hoard"], tag: "shieldwall+CINDER MAIL+2 TEMPER+2 PLATE ROLLER+RIVET HOARD", group: "cm" }),
];
const WANT = arg("--readers", "").split(",").filter(Boolean);
// --readers a,b: pairs by reader id (an id also takes its tagged variants of the main group) or by tag or by group ("sites": VENOM
// DRIP beside the multiplying sites; "cm": the CINDER MAIL stacks); none given: the main group; "all": every pair
const wanted = (p: PairDef): boolean =>
  WANT.includes("all") || (p.tag !== undefined && WANT.includes(p.tag)) || (WANT.length ? WANT.includes(p.group ?? "main") || (!p.group && WANT.includes(p.reader)) : !p.group);

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const holds = (b: Build, id: string): boolean => b.items.some((p) => p.def === id) || b.mods.some((m) => m.def === id);

/** `board` with one free ★`stars` copy of `def` where the par player would place it (null: it went to cargo, the deck is unchanged). */
function addPart(board: Build, def: string, stars: number, key: string): Build | null {
  const run = newRun(HERO, hashSeed("scale2e-pairs-run", HERO, DAY, key), `s2e-${HERO}-${DAY}`);
  run.build = cloneBuild(board);
  run.day = DAY;
  run.gold = 0;
  const uids = [...board.items, ...board.mods, ...(board.turrets ?? [])].map((p) => p.uid);
  run.nextUid = Math.max(100, ...uids) + 1;
  const r = placeFreePart(run, def, new Rng(hashSeed("scale2e-pairs-place", HERO, DAY, key, def)), undefined, stars);
  return r.placed ? run.build : null;
}
/** `board` plus a pair's feeders (each copy placed in turn), its runes; null if any part would not place. */
function withFeeders(board: Build, p: PairDef, key: string): Build | null {
  let b = board;
  for (const f of p.feeders) for (let c = 0; c < f.n; c++) {
    const n = addPart(b, f.id, STAR, `${key}|${f.id}${c}`);
    if (!n) return null;
    b = n;
  }
  if (p.runes?.length) { b = cloneBuild(b); b.runes = [...(b.runes ?? []), ...p.runes.map((id) => ({ id }))]; }
  return b;
}

// ---- the fights ----------------------------------------------------------------------------------------------------
interface Foe { b: Build; key: string }
let FIELD: Foe[] = [];
interface Fights { pts: number; n: number; ts: number[] }
/** `deck` (base index `i`) against every foe but itself: points per battle (win 1, draw 0.5), and the fight lengths. */
function fight(deck: Build, i: number, wantT: boolean): Fights {
  let pts = 0, n = 0;
  const ts: number[] = [];
  for (const f of FIELD) {
    if (f.key === `${HERO}:${i}`) continue;
    for (let s = 0; s < SEEDS; s++) {
      const seed = hashSeed("scale2e-pairs", DAY, HERO, i, f.key, s);
      const job: Job = { a: 0, b: 1, seeds: [seed], day: DAY };
      const cx = jobCounts(job, seed), cy = jobCounts(job, seed, true);
      const x = simulate(deck, f.b, seed, undefined, cx.wins, DAY, cx.lost);
      const y = simulate(f.b, deck, seed, undefined, cy.wins, DAY, cy.lost);
      pts += (x.winner === 0 ? 1 : x.winner === -1 ? 0.5 : 0) + (y.winner === 1 ? 1 : y.winner === -1 ? 0.5 : 0);
      n += 2;
      if (wantT) ts.push(Math.round(x.t * 10) / 10, Math.round(y.t * 10) / 10);
    }
  }
  return { pts: pts / n, n, ts };
}

// ---- star patches (--set), applied after the decks are built ----------------------------------------------------------
function patchStars(id: string, nums: number[]): string {
  const was = ITEMS[id];
  if (!was) throw new Error(`--set: ${id} is not in ITEMS`);
  const d = JSON.parse(JSON.stringify(was)) as ItemDef;
  const put = (e: ItemDef | undefined, n: number): boolean => {
    const x = e as unknown as { gate?: { reads?: { each: number } }; mod?: { reads?: { each: number } }; core?: { perQueued?: number } } | undefined;
    if (x?.gate?.reads) { x.gate.reads.each = n; return true; }
    if (x?.mod?.reads) { x.mod.reads.each = n; return true; }
    if (x?.core && x.core.perQueued !== undefined) { x.core.perQueued = n; return true; }
    return false;
  };
  const lv = d.levels as Record<number, ItemDef> | undefined;
  if (!put(d, nums[0])) throw new Error(`--set: ${id} has no reader number`);
  if (nums[1] !== undefined && lv?.[2]) put(lv[2], nums[1]);
  if (nums[2] !== undefined && lv?.[3]) put(lv[3], nums[2]);
  (ITEMS as Record<string, ItemDef>)[id] = d;
  clearStarCache();
  return `${id} -> ${nums.join("/")}`;
}

// ---- main ----------------------------------------------------------------------------------------------------------
const t0 = Date.now();
const out: Record<string, unknown> = { hero: HERO, day: DAY, star: STAR, k: K, m: M, seeds: SEEDS, pool: POOL, sets, nojam: NOJAM_OFF ? "off" : "on", rows: [] as unknown[] };
if (DRAKE2) setScaleRigs(false); // the decks are built in the off world: no scale piece in any deck, DRAKE + rig placed as the base game would
const bases = parField(HERO, DAY, POOL);
FIELD = [
  ...bases.slice(0, M).map((b, i) => ({ b, key: `${HERO}:${i}` })),
  ...FOES.filter((h) => h !== HERO).flatMap((h) => parField(h, DAY, M).map((b, i) => ({ b, key: `${h}:${i}` }))),
];
log(`par fields built (${bases.length} bases, ${FIELD.length} foes) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// ---- --drake2: DRAKE NOZZLE on the same decks, switch off and on (REQ-BFG-110; REVIEW-SCALE1 F5) -------------------------------
// With the switch on DRAKE converts only the DMG from rigs' stat rows (Payload.flat), never a FOR EACH rig's (Payload.each:
// LONG HAUL, PINCER, COUNTERWEIGHT, LODESTONE); off it converts all of it. Per clean base deck (no DRAKE, none of the four rigs):
//   base  the deck;   D0  every turret's core replaced by DRAKE at the day's star;   DX  D0 + one rig X (placed free, as the par player would)
//   XA    base + X (no DRAKE; the rig's own lift)
// Each is fought with the switch off and again on (same foes, same seeds). What moves: DX on - DX off (the guard), the rig's lift on
// a DRAKE deck (DX - D0) in each state, D0 on - D0 off (the control: what the state alone does to a DRAKE deck), XA - base.
if (DRAKE2) {
  const XS = ["longhaul", "pincer", "counterweight", "lodestone"];
  const bs: { i: number; b: Build }[] = [];
  for (let i = 0; i < bases.length && bs.length < K; i++) if (!holds(bases[i], "drake") && !XS.some((x) => holds(bases[i], x))) bs.push({ i, b: bases[i] });
  const drakeDeck = (b: Build): Build => {
    const c = cloneBuild(b);
    let uid = Math.max(100, ...c.items.map((p) => p.uid), ...c.mods.map((m) => m.uid)) + 1;
    for (const t of turretList(c)) {
      const m = c.mods.find((q) => q.turret === t.slot && ITEMS[q.def]?.kind === "core");
      if (m) { m.def = "drake"; if (STAR > 1) m.stars = STAR; else delete m.stars; }
      else c.mods.push({ uid: uid++, def: "drake", turret: t.slot, ...(STAR > 1 ? { stars: STAR } : {}) });
    }
    return c;
  };
  const decks = bs.map(({ i, b }) => {
    const d0 = drakeDeck(b);
    return { i, b, d0, x: XS.map((x) => ({ x, dx: addPart(d0, x, STAR, `d2|${x}|${i}`), xa: addPart(b, x, STAR, `d2a|${x}|${i}`) })) };
  });
  log(`drake2: ${decks.length} clean bases (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  type R = { i: number; base: number[]; d0: number[]; dx: Record<string, number[]>; xa: Record<string, number[]> };
  const res: R[] = decks.map((d) => ({ i: d.i, base: [], d0: [], dx: Object.fromEntries(XS.map((x) => [x, [] as number[]])), xa: Object.fromEntries(XS.map((x) => [x, [] as number[]])) }));
  for (const on of [false, true]) {
    setScaleRigs(on);
    decks.forEach((d, k) => {
      res[k].base.push(fight(d.b, d.i, false).pts);
      res[k].d0.push(fight(d.d0, d.i, false).pts);
      for (const e of d.x) { res[k].dx[e.x].push(e.dx ? fight(e.dx, d.i, false).pts : NaN); res[k].xa[e.x].push(e.xa ? fight(e.xa, d.i, false).pts : NaN); }
    });
    log(`drake2: switch ${on ? "on" : "off"} fought (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  const pp = (x: number): string => (Number.isNaN(x) ? "-" : `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`);
  for (const x of XS) {
    const ok = res.filter((r) => !Number.isNaN(r.dx[x][0]) && !Number.isNaN(r.xa[x][0]));
    log(`${x.padEnd(13)} n ${ok.length}/${res.length} | rig's lift on a DRAKE deck: off ${pp(mean(ok.map((r) => r.dx[x][0] - r.d0[0])))} on ${pp(mean(ok.map((r) => r.dx[x][1] - r.d0[1])))} | DRAKE+rig on - off ${pp(mean(ok.map((r) => r.dx[x][1] - r.dx[x][0])))} (control D0 on - off ${pp(mean(ok.map((r) => r.d0[1] - r.d0[0])))}) | rig alone - base: off ${pp(mean(ok.map((r) => r.xa[x][0] - r.base[0])))} on ${pp(mean(ok.map((r) => r.xa[x][1] - r.base[1])))}`);
  }
  out.drake2 = { xs: XS, res };
  out.seconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(OUT, JSON.stringify(out));
  log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
  process.exit(0);
}

interface Built { i: number; base: Build; feeder: Build | null; pair: Build | null; temper: Build | null; whet: Build | null }
const builtOf = new Map<PairDef, Built[]>();
const temperOf = new Map<number, Build | null>(), whetOf = new Map<number, Build | null>();
for (const p of PAIRS.filter(wanted)) {
  // a clean base: no copy of the reader, of any feeder REPORT-SCALE1 3.3 lists for it, or of the feeders this pair adds
  const need = [p.reader, ...(READER_FEEDERS[p.reader] ?? []), ...p.feeders.map((f) => f.id), ...(p.need ?? [])];
  const list: Built[] = [];
  for (let i = 0; i < bases.length && list.length < K; i++) {
    const base = bases[i];
    if (need.some((id) => holds(base, id))) continue;
    const key = `${p.tag ?? p.reader}|${i}`;
    const feeder = p.feeders.length || p.runes?.length ? withFeeders(base, p, key) : base;
    const pair = feeder ? addPart(feeder, p.reader, STAR, `${key}|reader`) : null;
    if (!temperOf.has(i)) temperOf.set(i, addPart(base, "temper", STAR, `temper|${i}`));
    if (!whetOf.has(i)) whetOf.set(i, addPart(base, "whetstone", STAR, `whet|${i}`));
    list.push({ i, base, feeder, pair, temper: temperOf.get(i) ?? null, whet: whetOf.get(i) ?? null });
  }
  builtOf.set(p, list);
  log(`${p.tag ?? p.reader}: ${list.length} clean bases, ${list.filter((b) => b.pair).length} pairs placed (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
if (NOJAM_OFF) {
  const d = JSON.parse(JSON.stringify(ITEMS.pressure)) as ItemDef & { core?: { noJam?: boolean } };
  if (d.core) d.core.noJam = false;
  (ITEMS as Record<string, ItemDef>)[ "pressure" ] = d;
  clearStarCache();
  log("PRESSURE BREECH: noJam off");
}
for (const s of sets) {
  const [id, v] = s.split("=");
  log(`set ${patchStars(id, v.split(",").map(Number))}`);
}

const baseCache = new Map<number, Fights>();
const temperCache = new Map<number, number>(), whetCache = new Map<number, number>();
const baseFights = (i: number, b: Build): Fights => { if (!baseCache.has(i)) baseCache.set(i, fight(b, i, true)); return baseCache.get(i)!; };
for (const [p, list] of builtOf) {
  const decks: unknown[] = [];
  for (const b of list) {
    const bf = baseFights(b.i, b.base);
    if (!temperCache.has(b.i)) temperCache.set(b.i, b.temper ? fight(b.temper, b.i, false).pts : NaN);
    if (!whetCache.has(b.i)) whetCache.set(b.i, b.whet ? fight(b.whet, b.i, false).pts : NaN);
    const ff = b.feeder && b.feeder !== b.base ? fight(b.feeder, b.i, false) : null;
    const pf = b.pair ? fight(b.pair, b.i, true) : null;
    decks.push({
      i: b.i, placedFeeder: !!b.feeder, placedPair: !!b.pair,
      base: bf.pts, temper: temperCache.get(b.i), whet: whetCache.get(b.i), feeder: ff ? ff.pts : b.feeder ? bf.pts : NaN, pair: pf ? pf.pts : NaN,
      n: bf.n, tBase: bf.ts, tPair: pf ? pf.ts : [],
    });
  }
  const ok = (decks as { pair: number }[]).filter((d) => !Number.isNaN(d.pair)) as { base: number; feeder: number; pair: number; temper: number }[];
  const pp = (x: number): string => (Number.isNaN(x) ? "-" : `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`);
  const lp = mean(ok.map((d) => d.pair - d.base)), lf = mean(ok.map((d) => d.feeder - d.base)), lt = mean(ok.map((d) => d.temper - d.base));
  (out.rows as unknown[]).push({ reader: p.reader, tag: p.tag ?? p.reader, feeders: p.feeders, runes: p.runes ?? [], decks });
  for (const c of cands) {
    const parts = c.split(";").map((x) => x.split("="));
    if (!parts.some(([id]) => id === p.reader)) continue;
    const saved = parts.map(([id]) => [id, ITEMS[id]] as const);
    for (const [id, v] of parts) patchStars(id, v.split(",").map(Number));
    const cdecks = list.map((b, k) => {
      const d = decks[k] as { i: number; placedFeeder: boolean; placedPair: boolean; base: number; temper: number; whet: number; feeder: number; n: number; tBase: number[] };
      const pf = b.pair ? fight(b.pair, b.i, true) : null;
      return { ...d, pair: pf ? pf.pts : NaN, tPair: pf ? pf.ts : [] };
    });
    for (const [id, was] of saved) (ITEMS as Record<string, ItemDef>)[id] = was;
    clearStarCache();
    (out.rows as unknown[]).push({ reader: p.reader, tag: `${p.tag ?? p.reader} @${c}`, feeders: p.feeders, runes: p.runes ?? [], decks: cdecks });
    const okc = cdecks.filter((d) => !Number.isNaN(d.pair));
    log(`${(p.tag ?? p.reader).padEnd(14)} @${c}: reader ${pp(mean(okc.map((d) => d.pair - d.feeder)))} pts (pair ${pp(mean(okc.map((d) => d.pair - d.base)))}) | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  log(`${(p.tag ?? p.reader).padEnd(14)} n ${ok.length}/${list.length} | pair ${pp(lp)} feeder ${pp(lf)} reader ${pp(lp - lf)} TEMPER ${pp(lt)} pts | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
out.seconds = Math.round((Date.now() - t0) / 1000);
writeFileSync(OUT, JSON.stringify(out));
log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
void ANSWERS;
