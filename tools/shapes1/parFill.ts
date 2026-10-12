// SHAPES-1 (REQ-BFG-086.6; BRIEF-SHAPES1 step 7a): THE FIT, ported from PIECES-1's tools/pieces1/parFill.ts and
// shapeHits.mjs (W/ref/pieces1/tools) to the footprint engine: how full a par deck is on day 5 and day 10, and what one
// more shaped rig could hit there, SHAPES off or on (--shapes), every base switch as it ships (NPC_DAY, HULL_SCALE,
// LADDER_FIX on); "without HEARTS/GUARD/PICK/OPEN_RUNES/FREE_JOINS" (not in this base). No battles beyond the par player's
// own road stops.
//
// The decks are PIECES-1's 696 (its section 2.6 and appendix): the par field (playerRun(hero, 10, s) for s = 1..--seeds,
// read at dusk of --days) of the six harness heroes; the same over seeds 1..--more (robustness); heroRefBuild; the bundled
// stand-in pool (all picks); the captains' dusk decks (standInBuild; not the Matriarch). With SHAPES on the par decks are
// the shaped par player's, and the stand-in pool's decoders re-place a reshaped factory (shapesStandIn).
// Per deck: a piece's cells are cellsOf (footprintCells at its rot), never `size`; belt tiles, rig and factory cells,
// free, % full, free cells beside a belt; problems: off the deck, overlap, a belt under machinery, occupancy disagreeing,
// and validateBuild's placement, route, rot or shape errors (tests/shapes1.bots' filter). The shaped pieces it holds.
// shapeHits (rule set B, the real engine): for NAIL STRIP, EMBER TROUGH and SPIKE RAIL (their defs, SHAPES_ITEMS), every
// placement (anchor x rot 0-3) whose cells are on the deck, free and off the row-0 intake cells (isIntakeCell); its hits =
// its arrows (rigArrowCells) that point at a belt tile. Per deck: the best placement's hits, the placements with at least
// 1 hit, and whether the best beats a 1-cell rig with the same arrows (best >= arrows + 1), as PIECES-1 section 5.2.
//
//   npx vite build --ssr tools/shapes1/parFill.ts --outDir <W>/tmp/bench/dist-parfill --emptyOutDir --logLevel warn
//   nice -n 19 node <W>/tmp/bench/dist-parfill/parFill.js --shapes on [--seeds 12] [--more 40] [--days 5,10] --out <dir>
// Writes only <out>/parfill-<on|off>.json and <out>/PARFILL-<on|off>.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GRID, HEROES, ITEMS, type HeroId, type ItemDef } from "../../src/sim/content";
import { cellsOf, isIntakeCell, occupancy, rigArrowCells, type Build } from "../../src/sim/deck";
import { footOnDeck, footprintCells, isShaped } from "../../src/sim/foot";
import { setHullScale } from "../../src/sim/hullScale";
import { setLadderFix } from "../../src/sim/ladderFix";
import { setNpcDay } from "../../src/sim/npcDay";
import { RESHAPED_IDS, SHAPES_IDS, SHAPES_ITEMS, setShapes, shapesRules } from "../../src/sim/shapes";
import { HARNESS_HEROES } from "../../src/sim/harness/heroes";
import { PAR_K, parSeeds } from "../../src/sim/harness/par";
import { playerRun } from "../../src/sim/harness/player";
import { heroRefBuild } from "../../src/sim/heroBuilds";
import { RIVALS, RIVAL_IDS, standInBuild } from "../../src/sim/rivals";
import { STAND_IN_POOL_HEROES, standInPool } from "../../src/sim/standInPool";
import { buildCost, validateBuild } from "../../src/net/validate";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ON = (arg("shapes") ?? "on") === "on";
const OUT = resolve(arg("out") ?? "/home/cap/.hermit/primes/.workspaces/cap/beltbattles-shapes1/output-shapes1/bench");
const NSEEDS = Number(arg("seeds") ?? PAR_K);
const MORE = Number(arg("more") ?? 40);
const RUN_HEROES = (arg("heroes")?.split(",").filter(Boolean) as HeroId[] | undefined) ?? [...HARNESS_HEROES];
const DAYS = (arg("days") ?? "5,10").split(",").filter(Boolean).map(Number);
const N = GRID * GRID;
const TAG = ON ? "on" : "off";

setHullScale(true);
setLadderFix(true);
setNpcDay(true);
setShapes(ON);

type Cell = "B" | "R" | "F" | ".";
interface Hits { best: number; spots: number; beyond: boolean }
interface Fill {
  src: string; hero: HeroId; day: number; seed?: number; label?: string;
  belt: number; rigCells: number; factoryCells: number; free: number; full: number; freeAdj: number;
  rigs: number; factories: number; routes: number; beltCap: number; value: number;
  shaped: string[]; hits: Record<string, Hits>; problems: string[];
}

const nbrs = (k: number): number[] => {
  const x = k % GRID, y = Math.floor(k / GRID), out: number[] = [];
  if (y > 0) out.push(k - GRID);
  if (x < GRID - 1) out.push(k + 1);
  if (y < GRID - 1) out.push(k + GRID);
  if (x > 0) out.push(k - 1);
  return out;
};
const placementErrors = (b: Build, day: number): string[] =>
  validateBuild(b, day, "strict").errors.filter((e) => /^(placement|route|item: uid \d+ .* rot|shape)/.test(e));

/** Rule set B on a deck's grid: the best placement of one more shaped rig `d`, its useful spots, and whether it beats a
 *  1-cell rig of the same arrows. */
function shapeHits(b: Build, g: Cell[], d: ItemDef): Hits {
  let best = 0, spots = 0;
  const arrows = rigArrowCells({ ...d, foot: "1" }, 5, 5, 0).length; // a 1-cell rig of the same arrows
  for (let rot = 0; rot < 4; rot++) for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (!footOnDeck(d, x, y, rot)) continue;
    const cells = footprintCells(d, x, y, rot);
    if (cells.some((k) => g[k] !== "." || isIntakeCell(b, k))) continue;
    const hits = rigArrowCells(d, x, y, rot).filter((a) => a.to >= 0 && g[a.to] === "B").length;
    if (hits >= 1) spots++;
    best = Math.max(best, hits);
  }
  return { best, spots, beyond: best >= arrows + 1 };
}

function measure(b: Build, src: string, day: number, extra: { seed?: number; label?: string } = {}): Fill {
  const g: Cell[] = Array<Cell>(N).fill(".");
  const problems: string[] = [];
  let rigs = 0, factories = 0;
  const shaped: string[] = [];
  for (const p of b.items) {
    const d = ITEMS[p.def];
    if (!d) { problems.push(`${p.def}: not in ITEMS`); continue; }
    if (d.kind === "gate") rigs++;
    else if (d.kind === "factory") factories++;
    else problems.push(`${p.def}: kind ${d.kind} on the deck`);
    if (isShaped(d)) shaped.push(p.def);
    if (!footOnDeck(d, p.x, p.y, p.rot ?? 0)) { problems.push(`${p.def} off the deck at ${p.x},${p.y} rot ${p.rot ?? 0}`); continue; }
    for (const k of cellsOf(p)) {
      if (g[k] !== ".") problems.push(`overlap at ${k % GRID},${Math.floor(k / GRID)}`);
      g[k] = d.kind === "gate" ? "R" : "F";
    }
  }
  for (const r of b.routes) for (const k of r.cells) {
    if (g[k] !== ".") problems.push(`belt over ${g[k]} at ${k % GRID},${Math.floor(k / GRID)}`);
    g[k] = "B";
  }
  const occ = occupancy(b);
  occ.forEach((o, k) => {
    const want: Cell = o.route >= 0 ? "B" : o.item >= 0 ? (ITEMS[b.items.find((p) => p.uid === o.item)!.def].kind === "gate" ? "R" : "F") : ".";
    if (want !== g[k]) problems.push(`occupancy disagrees at ${k}: ${want} vs ${g[k]}`);
  });
  for (const e of placementErrors(b, day)) problems.push(`validate: ${e}`);
  const count = (c: Cell): number => g.filter((v) => v === c).length;
  const belt = count("B"), rigCells = count("R"), factoryCells = count("F"), free = count(".");
  const freeAdj = g.reduce((s, v, k) => s + (v === "." && nbrs(k).some((n) => g[n] === "B") ? 1 : 0), 0);
  const hits: Record<string, Hits> = {};
  for (const id of SHAPES_IDS) hits[id] = shapeHits(b, g, SHAPES_ITEMS[id]);
  return {
    src, hero: b.hero, day, ...extra,
    belt, rigCells, factoryCells, free, full: (100 * (N - free)) / N, freeAdj,
    rigs, factories, routes: b.routes.length, beltCap: b.beltCap, value: buildCost(b).total,
    shaped, hits, problems,
  };
}

const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
const r1 = (v: number): string => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "");
function agg(xs: number[], pct = false): string {
  if (!xs.length) return "-";
  const lo = Math.min(...xs), hi = Math.max(...xs), u = pct ? "%" : "";
  return lo === hi ? `${r1(lo)}${u}` : `${r1(mean(xs))}${u} (${r1(lo)}-${r1(hi)})`;
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const field: Fill[] = [], more: Fill[] = [], errors: string[] = [];
  for (const hero of RUN_HEROES) {
    for (const s of parSeeds(Math.max(NSEEDS, MORE))) {
      try {
        const run = playerRun(hero, Math.max(...DAYS), s);
        for (const day of DAYS) {
          const f = measure(run[day - 1].build, s <= NSEEDS ? "par" : "par-more", day, { seed: s });
          (s <= NSEEDS ? field : more).push(f);
          if (s <= NSEEDS) more.push({ ...f, src: "par-more" }); // seeds 1..MORE include the field's
        }
      } catch (e) {
        errors.push(`${hero} seed ${s}: ${(e as Error).message}`);
      }
    }
    console.log(`parFill ${TAG} ${hero}: ${Math.max(NSEEDS, MORE)} runs, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const heroref: Fill[] = [];
  for (const hero of RUN_HEROES) for (const day of DAYS) heroref.push(measure(heroRefBuild(hero, day), "heroref", day));
  const pool: Fill[] = [];
  for (const hero of STAND_IN_POOL_HEROES) for (const day of DAYS) standInPool(hero, day).forEach((e, i) => pool.push(measure(e.build, "pool", day, { seed: i })));
  const captains: Fill[] = [];
  for (const id of RIVAL_IDS) {
    if (id === "matriarch") continue;
    for (const day of DAYS) captains.push(measure(standInBuild(id, day), "captain", day, { label: RIVALS[id].name }));
  }
  const decks = [...field, ...more.filter((f) => (f.seed ?? 0) > NSEEDS), ...heroref, ...pool, ...captains];
  const bad = decks.filter((f) => f.problems.length);
  writeFileSync(resolve(OUT, `parfill-${TAG}.json`), JSON.stringify({ shapes: ON, shapesRules: shapesRules(), seeds: NSEEDS, moreSeeds: MORE, days: DAYS, heroes: RUN_HEROES, field, more, heroref, pool, captains, errors }, null, 1));

  const by = (fs: Fill[], hero: HeroId, day: number): Fill[] => fs.filter((f) => f.hero === hero && f.day === day);
  const name = (h: HeroId): string => HEROES[h].name;
  const L: string[] = [];
  L.push(`# PARFILL (SHAPES-1 step 7a): SHAPES ${TAG}, NPC_DAY/HULL_SCALE/LADDER_FIX on, without HEARTS/GUARD/PICK/OPEN_RUNES/FREE_JOINS`, "");
  L.push(`tools/shapes1/parFill.ts. Decks: par field ${field.length} (seeds 1..${NSEEDS}), robustness ${more.length} (seeds 1..${MORE}, the field's included), heroRefBuild ${heroref.length}, stand-in pool ${pool.length}, captains ${captains.length}: ${field.length + more.length + heroref.length + pool.length + captains.length} measured as PIECES-1 counted them (${decks.length} distinct). Wall ${((Date.now() - t0) / 1000).toFixed(0)} s.`, "");
  L.push(`## Par field (seeds 1..${NSEEDS}): fill`, "");
  L.push("| hero | day | decks | % full | belt tiles | rig cells | factory cells | free | free cells beside a belt | belt used / cap | shaped pieces held (decks) |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const h of RUN_HEROES) for (const d of DAYS) {
    const fs = by(field, h, d);
    if (!fs.length) continue;
    const held = new Map<string, number>();
    for (const f of fs) for (const id of new Set(f.shaped)) held.set(id, (held.get(id) ?? 0) + 1);
    const heldStr = [...held.entries()].map(([id, n]) => `${ITEMS[id]?.name ?? id} ${n}`).join(", ") || "-";
    L.push(`| ${name(h)} | ${d} | ${fs.length} | ${agg(fs.map((f) => f.full), true)} | ${agg(fs.map((f) => f.belt))} | ${agg(fs.map((f) => f.rigCells))} | ${agg(fs.map((f) => f.factoryCells))} | ${agg(fs.map((f) => f.free))} | ${agg(fs.map((f) => f.freeAdj))} | ${r1(mean(fs.map((f) => f.belt)))} / ${r1(mean(fs.map((f) => f.beltCap)))} | ${heldStr} |`);
  }
  L.push("", `## Robustness (seeds 1..${MORE}): fill`, "");
  L.push("| hero | day | decks | % full | free cells beside a belt | max % full |");
  L.push("|---|---|---|---|---|---|");
  for (const h of RUN_HEROES) for (const d of DAYS) {
    const fs = by(more, h, d);
    if (fs.length) L.push(`| ${name(h)} | ${d} | ${fs.length} | ${agg(fs.map((f) => f.full), true)} | ${agg(fs.map((f) => f.freeAdj))} | ${r1(Math.max(...fs.map((f) => f.full)))}% |`);
  }
  for (const day of DAYS) {
    L.push("", `## shapeHits, day ${day} (par field, seeds 1..${NSEEDS}): one more shaped rig, rule set B, the real engine`, "");
    L.push(`| piece | ${RUN_HEROES.map((h) => name(h)).join(" | ")} |`);
    L.push(`|---|${RUN_HEROES.map(() => "---").join("|")}|`);
    for (const id of SHAPES_IDS) {
      const cells = RUN_HEROES.map((h) => {
        const fs = by(field, h, day);
        if (!fs.length) return "-";
        const hs = fs.map((f) => f.hits[id]);
        return `${r1(mean(hs.map((x) => x.best)))} (${Math.round((100 * hs.filter((x) => x.beyond).length) / hs.length)}%), ${r1(mean(hs.map((x) => x.spots)))} spots`;
      });
      L.push(`| ${SHAPES_ITEMS[id].name} (${SHAPES_ITEMS[id].foot}) | ${cells.join(" | ")} |`);
    }
  }
  L.push("", "## Checks", "");
  L.push(`- Decks with a problem (off the deck, overlap, belt under machinery, occupancy, validateBuild placement/route/rot/shape): ${bad.length}${bad.length ? `: ${bad.slice(0, 8).map((f) => `${f.src} ${f.hero} d${f.day} ${f.seed ?? f.label ?? ""}: ${f.problems[0]}`).join("; ")}` : ""}.`);
  L.push(`- Par player errors: ${errors.length ? errors.join("; ") : "none"}.`);
  const d10 = [...field, ...more].filter((f) => f.day === 10);
  L.push(`- Day-10 par decks (field + robustness): ${d10.length}; most full ${r1(Math.max(...d10.map((f) => f.full)))}%; fewest free cells ${Math.min(...d10.map((f) => f.free))}; holding a shaped piece: ${d10.filter((f) => f.shaped.length).length}.`);
  L.push(`- Reshaped factory ids: ${RESHAPED_IDS.join(", ")}; shaped rigs: ${SHAPES_IDS.join(", ")}.`);
  writeFileSync(resolve(OUT, `PARFILL-${TAG}.md`), L.join("\n") + "\n");
  console.log(`parFill ${TAG}: ${decks.length} decks, ${bad.length} with problems, ${errors.length} errors; ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${resolve(OUT, `PARFILL-${TAG}.md`)}`);
}

main();
