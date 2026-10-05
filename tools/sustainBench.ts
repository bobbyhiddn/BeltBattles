// SUS-A (REQ-BFG-069): the acceptance bench (SUSTAIN-1 5.8, cap's answer 5), ported from the throwaway sustain1-bench
// (e1fd782) to the REAL pieces: no global flag; every rule is the sim's own (battle.ts SHIELD, heal(), REGEN). The par
// fields (par.ts parField: the par player's decks, seeds 1..k) of every harness hero meet on fixed seeds, every seed
// from both sides, cross pairs and mirrors, on each day. Each setting changes the DECKS, never the rules:
//   off     num2's par decks unchanged (RIVETER, where a par deck bought one, heals by the rules now).
//   typ2r   the typical load: BASTION a WARD BELL, FOUNDRY a MEND PRESS, WEAVER a MENDING LOOM, at ★1 on days 1-4, ★2 on
//           days 5-8, ★3 on days 9-10; the other heroes nothing new; RIVETER wherever a par deck already holds it.
//   heavy2r the stress mirror: every deck on both sides holds WARD BELL ★3, MENDING LOOM ★3, MEND PRESS ★3 and RIVETER ★3
//           (a held RIVETER goes to ★3), plus WARD STONE (3 SHIELD at the start).
// The one allowed number change (cap's answer 3): the first full run (at eff8968, WARD BELL ★1 every 6 s) had FURNACE at
// 44.3% pooled under typ2r (< 45%), so content.ts's WARD BELL ★1 is every 8 s now and typ2r reads it (the run's
// typ2r8 setting, a bench-only ★1 def at 8 s, is gone with it).
// ONE placement rule for every deck (placeAll below): a free gear slot or grid cell, else replace the cheapest
// non-damage piece of the same kind; a deck where neither exists goes without (counted in the output).
//   gear (WARD BELL, MENDING LOOM): the first installed turret, in slot order, with a free gear slot that doesn't hold the
//     same def; else the cheapest non-damage gear (MANTLET, FLAK SCREEN, SPOTTER, SEAM WELDER: no damage field) on any
//     turret, ties by turret then uid.
//   MEND PRESS (a factory; like ARMOR PRESS it works only with a belt to a turret): the par player's rule for a new
//     factory (player.ts factoryPlan): the free 2x2 spot off the forward row with the shortest belt into a free intake
//     within the spare belt (ties: row order, then intake order), the belt drawn by path.ts randomPath on a fixed seed;
//     else the cheapest bought (non-signature) factory becomes the MEND PRESS, in its place with its belts.
//   RIVETER (heavy2r): a held one goes to ★3; else a free cell off the forward row and a rotation whose arrows hit the
//     most belt tiles (ties: cell order, then rotation); else the cheapest non-damage rig becomes it.
//   npx vite build --ssr tools/sustainBench.ts --outDir tools/dist/susa --emptyOutDir --logLevel warn
//   nice -n 19 node tools/dist/susa/sustainBench.js --days 1,3,6,10 --k 6 --seeds 4 --workers 2 --settings off,typ2r,heavy2r --json out.json
// Reports, per day and setting: fight length (median, p10, p90, mean; mirrors), hard stops (120 s), fights of 60 s or
// more, the share in the wind (25 s or more), hero win rates (Wilson 95%) and the paired shift against off, flips, and
// what the sustain did per battle (hits stopped, SHIELD gained, hull healed, healing lost to BURN and to the wind).

import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { writeFileSync } from "node:fs";
import { Rng, hashSeed } from "../src/core/rng";
import { Battle } from "../src/sim/battle";
import { BATTLE_CAP, GRID, HEROES, ITEMS, WIND_START, type HeroId } from "../src/sim/content";
import {
  arrowCell, cloneBuild, commitRoute, footprint, gearSlotsOf, installedTurrets, occupancy, rigArrows, rigHits, type Build,
} from "../src/sim/deck";
import { parField } from "../src/sim/harness/par";
import { blockedCells, freeConnectors, randomPath, shortestTiles, startCells } from "../src/sim/harness/path";
import { wilson } from "../src/sim/harness/stats";

interface Fight { a: number; b: number; seed: number }
interface Chunk { id: number; field: Build[]; fights: Fight[] }
// per fight: winner (-2 none), t, hull0, hull1, max0, max1, stopped0, stopped1, healed0, healed1, burnLost0, burnLost1,
// windLost0, windLost1, gained0, gained1, windTaken0, windTaken1
type Out = number[];

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const num = (name: string, d: number): number => (flag(name) === undefined ? d : Number(flag(name)));

/** The star a typical deck's sustain piece holds on `day`: ★1 on days 1-4, ★2 on 5-8, ★3 on 9-10. */
const starOf = (day: number): 1 | 2 | 3 => (day <= 4 ? 1 : day <= 8 ? 2 : 3);
const starField = (s: number): { stars?: number } => (s > 1 ? { stars: s } : {});

const nextUid = (b: Build): number =>
  1 + Math.max(0, ...b.items.map((p) => p.uid), ...b.mods.map((m) => m.uid), ...(b.turrets ?? []).map((t) => t.uid));
const valueOf = (def: string, stars = 1): number => ITEMS[def].price * 2 ** ((stars ?? 1) - 1);

// a mod's damage fields (anything else is "non-damage" gear: MANTLET, FLAK SCREEN, SPOTTER, SEAM WELDER, the new pieces)
const MOD_DAMAGE = ["fireRate", "perShot", "window", "windowTime", "store", "noJam", "finisher", "longRideFlat", "pairBonus", "spall"];
// a rig's damage fields (anything else is a non-damage rig: speed, guards, tolls, sifting without flat, stokers, plating)
const GATE_DAMAGE = ["flat", "burn", "perPriorGate", "split", "poison", "burnPerRide", "quench", "perStalled", "fray", "perTile",
  "heat", "sort", "gauge", "pincer", "latch", "breaker", "plated", "keg", "lockedFlat", "pulse", "siftFlat", "siftClean", "shock", "staticTime"];
const hasAny = (o: object | undefined, keys: string[]): boolean => !!o && keys.some((k) => (o as Record<string, unknown>)[k] !== undefined);

/** What a placement did, per piece: "free" (a free slot or cell), "replace" (took a non-damage piece's place), "star"
 *  (a held one raised), "none" (no room). */
type How = "free" | "replace" | "star" | "none";

function placeGear(b: Build, def: string, stars: number): How {
  const views = installedTurrets(b);
  for (const v of views) {
    const on = b.mods.filter((m) => m.turret === v.slot && ITEMS[m.def]?.kind === "mod");
    if (on.some((m) => m.def === def)) continue;
    if (on.length < gearSlotsOf(v.turret.def, v.turret.stars)) {
      b.mods.push({ uid: nextUid(b), def, turret: v.slot, ...starField(stars) });
      return "free";
    }
  }
  const cand = b.mods
    .filter((m) => ITEMS[m.def]?.kind === "mod" && m.def !== def && !hasAny(ITEMS[m.def].mod, MOD_DAMAGE)
      && !b.mods.some((x) => x.turret === m.turret && x.def === def))
    .sort((x, y) => valueOf(x.def, x.stars) - valueOf(y.def, y.stars) || x.turret - y.turret || x.uid - y.uid);
  if (!cand.length) return "none";
  const m = cand[0];
  m.def = def;
  delete m.stars;
  Object.assign(m, starField(stars));
  return "replace";
}

const beltFree = (b: Build): number => b.beltCap - b.routes.reduce((s, r) => s + r.cells.length, 0);

function placePress(b: Build, stars: number, seed: number): How {
  const d = ITEMS.mendpress, cols = freeConnectors(b), occ = occupancy(b), bl0 = blockedCells(b), spare = beltFree(b);
  let best: { x: number; y: number; col: number; len: number } | null = null;
  for (let y = 1; y + d.size <= GRID && cols.length; y++) {
    for (let x = 0; x + d.size <= GRID; x++) {
      if (footprint(d, x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
      const bl = bl0.slice();
      for (const k of footprint(d, x, y)) if (k >= 0 && k < bl.length) bl[k] = 1;
      const starts = startCells(x, y, d.size, bl);
      for (const col of cols) {
        const len = shortestTiles(bl, starts, col);
        if (len > spare) continue;
        if (!best || len < best.len) best = { x, y, col, len };
      }
    }
  }
  if (best) {
    const uid = nextUid(b);
    b.items.push({ uid, def: "mendpress", x: best.x, y: best.y, ...starField(stars) });
    const bl = blockedCells(b), starts = startCells(best.x, best.y, d.size, bl);
    const cells = randomPath(bl, starts, best.col, best.len, new Rng(seed));
    if (cells) {
      commitRoute(b, uid, cells, -1);
      return "free";
    }
    b.items.pop();
  }
  const sig = HEROES[b.hero].factory;
  const cand = b.items.filter((p) => ITEMS[p.def]?.kind === "factory" && p.def !== sig && ITEMS[p.def].size === 2)
    .sort((x, y) => valueOf(x.def, x.stars) - valueOf(y.def, y.stars) || x.uid - y.uid);
  if (!cand.length) return "none";
  const p = cand[0];
  p.def = "mendpress";
  delete p.stars;
  Object.assign(p, starField(stars));
  return "replace";
}

function placeRiveter(b: Build, stars: number): How {
  const held = b.items.find((p) => p.def === "riveter");
  if (held) {
    delete held.stars;
    Object.assign(held, starField(stars));
    return "star";
  }
  const occ = occupancy(b);
  let best: { x: number; y: number; rot: number; n: number } | null = null;
  for (let y = 1; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const k = y * GRID + x;
    if (occ[k].item >= 0 || occ[k].route >= 0) continue;
    for (let rot = 0; rot < 4; rot++) {
      const n = rigArrows("riveter", rot).filter((dir) => { const c = arrowCell(x, y, dir); return c >= 0 && occ[c].route >= 0; }).length;
      if (n > 0 && (!best || n > best.n)) best = { x, y, rot, n };
    }
  }
  if (best) {
    b.items.push({ uid: nextUid(b), def: "riveter", x: best.x, y: best.y, ...(best.rot ? { rot: best.rot } : {}), ...starField(stars) });
    return "free";
  }
  const cand = b.items.filter((p) => ITEMS[p.def]?.kind === "gate" && !hasAny(ITEMS[p.def].gate, GATE_DAMAGE))
    .sort((x, y) => valueOf(x.def, x.stars) - valueOf(y.def, y.stars) || x.uid - y.uid);
  if (!cand.length) return "none";
  const p = cand[0];
  p.def = "riveter";
  delete p.stars;
  Object.assign(p, starField(stars));
  return "replace";
}

/** The deck a setting fights with (a copy), and how each piece was placed. */
export function transform(setting: string, day: number, src: Build, seed: number): { b: Build; how: Record<string, How> } {
  const b = cloneBuild(src);
  const how: Record<string, How> = {};
  const s = starOf(day);
  if (setting === "typ2r") {
    if (b.hero === "bastion") how.wardbell = placeGear(b, "wardbell", s);
    if (b.hero === "foundry") how.mendpress = placePress(b, s, seed);
    if (b.hero === "weaver") how.mendingloom = placeGear(b, "mendingloom", s);
  } else if (setting === "heavy2r") {
    how.wardbell = placeGear(b, "wardbell", 3);
    how.mendingloom = placeGear(b, "mendingloom", 3);
    how.mendpress = placePress(b, 3, seed);
    how.riveter = placeRiveter(b, 3);
    b.runes = [...(b.runes ?? []), { id: "ward_stone" }];
  } else if (setting !== "off") throw new Error(`unknown setting ${setting}`);
  return { b, how };
}

function play(field: Build[], f: Fight): Out {
  const bt = new Battle(field[f.a], field[f.b], f.seed);
  while (!bt.over && bt.ticks < 60 * 200) { // simulate()'s loop
    bt.step();
    bt.events.length = 0;
  }
  const [s0, s1] = bt.sides;
  const c0 = s0.heals, c1 = s1.heals;
  return [bt.winner ?? -2, bt.t, s0.hull.hp, s1.hull.hp, s0.hull.max, s1.hull.max, s0.blocked ?? 0, s1.blocked ?? 0,
    c0?.healed ?? 0, c1?.healed ?? 0, c0?.burnLost ?? 0, c1?.burnLost ?? 0, c0?.windLost ?? 0, c1?.windLost ?? 0,
    c0?.gained ?? 0, c1?.gained ?? 0, s0.stats.windTaken, s1.stats.windTaken];
}

function pool(n: number, script: string) {
  const ws = Array.from({ length: n }, () => new Worker(new URL(script)));
  const run = (field: Build[], fights: Fight[]) => new Promise<Out[]>((done, fail) => {
    const size = Math.max(8, Math.ceil(fights.length / (n * 8)));
    const chunks: Chunk[] = [];
    for (let i = 0; i < fights.length; i += size) chunks.push({ id: chunks.length, field, fights: fights.slice(i, i + size) });
    const out = new Array<Out>(fights.length);
    let next = 0, pending = chunks.length;
    if (!pending) return done(out);
    const feed = (w: Worker) => { if (next < chunks.length) w.postMessage(chunks[next++]); };
    for (const w of ws) {
      w.removeAllListeners();
      w.on("error", fail);
      w.on("message", (m: { id: number; out: Out[] }) => {
        m.out.forEach((o, i) => (out[m.id * size + i] = o));
        if (--pending === 0) done(out);
        else feed(w);
      });
      feed(w);
    }
  });
  return { run, close: () => Promise.all(ws.map((w) => w.terminate())) };
}

const pct = (x: number) => (100 * x).toFixed(1);
const q = (xs: number[], p: number): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };

async function main(): Promise<void> {
  const days = (flag("days") ?? "1,3,6,10").split(",").map(Number);
  const k = num("k", 6), S = num("seeds", 4), nw = num("workers", 2);
  const settings = (flag("settings") ?? "off,typ2r,heavy2r").split(",");
  const heroes = (flag("heroes")?.split(",") as HeroId[] | undefined) ?? (["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"] as HeroId[]);
  const H = heroes.length;
  const workers = pool(nw, import.meta.url);
  const t00 = performance.now();
  const json: Record<string, unknown>[] = [];
  const pooled = new Map<string, { pts: number[]; n: number[] }>();
  const paired = new Map<string, number[][]>(); // per setting, per hero: each cross battle's points minus off's
  const hardAll = new Map<string, { hard: number; n: number; hardMir: number; nMir: number; over60: number }>();
  for (const day of days) {
    const t0 = performance.now();
    const base: Build[] = [];
    for (const h of heroes) base.push(...parField(h, day, k));
    const tf = (performance.now() - t0) / 1000;
    const fights: Fight[] = [];
    const meta: { x: number; y: number; aIsX: boolean; mirror: boolean }[] = [];
    for (let x = 0; x < H; x++) for (let y = x; y < H; y++) for (let i = 0; i < k; i++) for (let j = x === y ? i + 1 : 0; j < k; j++) {
      for (let s = 0; s < S; s++) {
        const seed = hashSeed("sustain1", day, heroes[x], heroes[y], i, j, s);
        fights.push({ a: x * k + i, b: y * k + j, seed }); meta.push({ x, y, aIsX: true, mirror: x === y });
        fights.push({ a: y * k + j, b: x * k + i, seed }); meta.push({ x, y, aIsX: false, mirror: x === y });
      }
    }
    const res = new Map<string, Out[]>();
    const secs: Record<string, number> = {};
    const placed: Record<string, Record<string, Record<How, number>>> = {};
    for (const st of settings) {
      const t1 = performance.now();
      const field = base.map((d, i) => {
        const { b, how } = transform(st, day, d, hashSeed("susa-place", day, i));
        for (const [piece, h] of Object.entries(how)) {
          const row = ((placed[st] ??= {})[piece] ??= { free: 0, replace: 0, star: 0, none: 0 });
          row[h]++;
        }
        return b;
      });
      res.set(st, await workers.run(field, fights));
      secs[st] = Math.round((performance.now() - t1) / 100) / 10;
    }
    const off = res.get("off");
    console.log(`\n== day ${day}: ${heroes.join(" ")}; par fields k=${k} (built in ${tf.toFixed(0)} s); ${fights.length} battles per setting (${S} seeds x both sides; cross pairs and mirrors)`);
    const rows: Record<string, unknown>[] = [];
    for (const st of settings) {
      const out = res.get(st)!;
      const ts = out.map((o) => o[1]);
      const mir = out.filter((_, f) => meta[f].mirror);
      const hard = out.filter((o) => o[1] >= BATTLE_CAP - 1e-6).length;
      const hardMir = mir.filter((o) => o[1] >= BATTLE_CAP - 1e-6).length;
      const over60 = out.filter((o) => o[1] >= 60).length;
      const pts = Array(H).fill(0), n = Array(H).fill(0);
      let flips = 0, same = 0, stopped = 0, healed = 0, burnLost = 0, windLost = 0, gained = 0, draws = 0;
      out.forEach((o, f) => {
        const m = meta[f], w = o[0];
        if (off && off[f][0] !== w) flips++;
        if (off && [0, 1, 2, 3].every((i) => Object.is(off[f][i], o[i]))) same++;
        stopped += o[6] + o[7]; healed += o[8] + o[9]; burnLost += o[10] + o[11]; windLost += o[12] + o[13]; gained += o[14] + o[15];
        if (w === -1 || w === -2) draws++;
        if (m.mirror) return;
        const xSide = m.aIsX ? 0 : 1;
        const xp = w === xSide ? 1 : w === -1 || w === -2 ? 0.5 : 0;
        pts[m.x] += xp; pts[m.y] += 1 - xp; n[m.x]++; n[m.y]++;
        if (off && st !== "off") {
          const w0 = off[f][0], xp0 = w0 === xSide ? 1 : w0 === -1 || w0 === -2 ? 0.5 : 0;
          const pd = paired.get(st) ?? paired.set(st, Array.from({ length: H }, () => [])).get(st)!;
          pd[m.x].push(xp - xp0); pd[m.y].push(xp0 - xp);
        }
      });
      const ha = hardAll.get(st) ?? { hard: 0, n: 0, hardMir: 0, nMir: 0, over60: 0 };
      ha.hard += hard; ha.n += out.length; ha.hardMir += hardMir; ha.nMir += mir.length; ha.over60 += over60;
      hardAll.set(st, ha);
      const wr = pts.map((v, i) => wilson(v, n[i]));
      const offRow = rows.find((r) => r.setting === "off") as { wr: { p: number }[]; median: number; p10: number } | undefined;
      const g = pooled.get(st) ?? { pts: Array(H).fill(0), n: Array(H).fill(0) };
      pts.forEach((v, i) => { g.pts[i] += v; g.n[i] += n[i]; });
      pooled.set(st, g);
      const N = out.length;
      const row = {
        setting: st, battles: N, median: q(ts, 0.5), p10: q(ts, 0.1), p90: q(ts, 0.9), mean: ts.reduce((a, b) => a + b, 0) / N,
        mirrorMedian: q(mir.map((o) => o[1]), 0.5), mirrorP90: q(mir.map((o) => o[1]), 0.9),
        hardStop: hard / N, hardStops: hard, hardStopMirror: mir.length ? hardMir / mir.length : 0, hardStopsMirror: hardMir,
        over60: over60 / N, over60n: over60, inWind: out.filter((o) => o[1] >= WIND_START).length / N, draws: draws / N,
        wr: wr.map((r) => ({ p: r.p, lo: r.lo, hi: r.hi, n: r.n })), dWr: offRow ? wr.map((r, i) => r.p - offRow.wr[i].p) : null,
        dMedian: offRow ? q(ts, 0.5) - offRow.median : null, dP10: offRow ? q(ts, 0.1) - offRow.p10 : null,
        flips: off ? flips / N : null, identicalToOff: off ? same === N : null,
        perBattle: { stopped: stopped / N, shieldGained: gained / N, healed: healed / N, burnLost: burnLost / N, windLost: windLost / N },
        placed: placed[st] ?? {}, secs: secs[st],
      };
      rows.push(row);
      console.log(`${st.padStart(7)} | t med ${row.median.toFixed(2)} p10 ${row.p10.toFixed(2)} p90 ${row.p90.toFixed(2)} (mirror ${row.mirrorMedian.toFixed(1)}/p90 ${row.mirrorP90.toFixed(1)})${row.dMedian !== null && st !== "off" ? ` d med ${row.dMedian >= 0 ? "+" : ""}${row.dMedian.toFixed(2)} d p10 ${row.dP10! >= 0 ? "+" : ""}${row.dP10!.toFixed(2)}` : ""} | hard ${pct(row.hardStop)}% (${hard}; mirrors ${hardMir}) | >=60 s ${pct(row.over60)}% (${over60}) | wind ${pct(row.inWind)}% | draws ${pct(row.draws)}%${row.flips !== null && st !== "off" ? ` | flips ${pct(row.flips)}%` : ""} | per battle: stopped ${row.perBattle.stopped.toFixed(2)} shield+ ${row.perBattle.shieldGained.toFixed(2)} healed ${row.perBattle.healed.toFixed(1)} lost burn ${row.perBattle.burnLost.toFixed(1)} wind ${row.perBattle.windLost.toFixed(1)} | ${secs[st]} s`);
      console.log(`        ${heroes.map((h, i) => `${h.slice(0, 4).toUpperCase()} ${pct(wr[i].p)} [${pct(wr[i].lo)}-${pct(wr[i].hi)}]${row.dWr && st !== "off" ? ` (${row.dWr[i] >= 0 ? "+" : ""}${pct(row.dWr[i])})` : ""}`).join("  ")}`);
      if (Object.keys(row.placed).length) console.log(`        placed: ${Object.entries(row.placed).map(([p, h]) => `${p} ${Object.entries(h).filter(([, v]) => v).map(([kk, v]) => `${kk} ${v}`).join("/")}`).join("; ")}`);
    }
    json.push({ day, k, seeds: S, heroes, battlesPerSetting: fights.length, fieldSecs: tf, rows });
  }
  console.log(`\n== pooled over days ${days.join(",")} (cross-hero battles; Wilson 95%; the shift vs off paired by battle, mean +- 1.96 sd/sqrt(n))`);
  const pooledOut: Record<string, unknown>[] = [];
  for (const [st, g] of pooled) {
    const wr = g.pts.map((v, i) => wilson(v, g.n[i]));
    const pd = paired.get(st);
    const shift = pd ? pd.map((ds) => {
      const nn = ds.length, d = ds.reduce((a, b) => a + b, 0) / nn;
      const sd = Math.sqrt(ds.reduce((a, b) => a + (b - d) ** 2, 0) / Math.max(1, nn - 1));
      return { d, lo: d - (1.96 * sd) / Math.sqrt(nn), hi: d + (1.96 * sd) / Math.sqrt(nn) };
    }) : null;
    const ha = hardAll.get(st)!;
    pooledOut.push({ setting: st, heroes, wr, shift, hardStop: ha.hard / ha.n, hardStops: ha.hard, battles: ha.n, hardStopMirror: ha.nMir ? ha.hardMir / ha.nMir : 0, over60: ha.over60 / ha.n });
    console.log(`${st.padStart(7)} | hard ${pct(ha.hard / ha.n)}% (${ha.hard}/${ha.n}; mirrors ${ha.hardMir}/${ha.nMir}) | >=60 s ${pct(ha.over60 / ha.n)}% | ${heroes.map((h, i) => `${h.slice(0, 4).toUpperCase()} ${pct(wr[i].p)} [${pct(wr[i].lo)}-${pct(wr[i].hi)}]${shift ? ` d ${shift[i].d >= 0 ? "+" : ""}${pct(shift[i].d)} [${pct(shift[i].lo)}, ${pct(shift[i].hi)}]` : ""}`).join("  ")}`);
  }
  console.log(`total ${((performance.now() - t00) / 1000).toFixed(0)} s on ${nw} worker(s)`);
  const jf = flag("json");
  if (jf) writeFileSync(jf, JSON.stringify({ args: process.argv.slice(2), days: json, pooled: pooledOut }, null, 1));
  await workers.close();
}

// only when the built bench runs (node .../sustainBench.js; its worker threads share that argv): a worker of it, or its
// main. Imported elsewhere (tests/sustain.stall.test.ts reads transform), it does nothing
const benchRun = !!process.argv[1]?.endsWith("sustainBench.js");
if (benchRun && !isMainThread) {
  parentPort!.on("message", (c: Chunk) => {
    parentPort!.postMessage({ id: c.id, out: c.fights.map((f) => play(c.field, f)) });
  });
} else if (benchRun) void main();
