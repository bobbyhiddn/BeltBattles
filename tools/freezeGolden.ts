// 0.6.1a M1: freeze the 0.6.0 golden fixtures (ARSENAL.md §10 item 5). NOT part of npm test.
//   npx vite build --ssr tools/freezeGolden.ts --outDir tools/dist/golden --emptyOutDir --logLevel warn
//   node tools/dist/golden/freezeGolden.js
// Writes tests/fixtures/golden-060/*.json: every rival captain's deck on days 1-10 (planBuild, as the
// game builds it through rivalBuild), both playable heroes' starting decks, the par decks
// (honestReference, furnace and weaver, days 1-10) and 20 stand-in pool picks (standInPick, furnace
// and weaver, days 1-10, one fixed seed). Each deck carries the result of one fixed battle: the deck
// on side 0 against the OTHER hero's par deck of the same day (frozen in par.json), seed GOLDEN_SEED.
// tests/golden.identity.test.ts replays every entry. Never edit the fixtures after the M1 commit.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { simulate } from "../src/sim/battle";
import type { Build } from "../src/sim/deck";
import { heroStartBuild, PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { honestReference, RIVAL_IDS, rivalBuild } from "../src/sim/rivals";
import { standInPick } from "../src/sim/standInPool";

export const GOLDEN_SEED = 60600; // the fixed battle seed
export const PICK_SEED = 20260924; // the fixed stand-in pick seed
const DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface Entry {
  key: string; // e.g. "rival/emberlyn/3", "start/furnace", "par/weaver/7", "standin/furnace/2"
  hero: HeroId;
  day: number;
  deck: Build;
  opp: string; // key into par.json
  seed: number;
  winner: number | null;
  t: number;
  ticks: number;
  hulls: [number, number];
}

const other = (h: HeroId): HeroId => (h === "furnace" ? "weaver" : "furnace");
const clone = (b: Build): Build => JSON.parse(JSON.stringify(b)) as Build;

const par = new Map<string, Build>();
for (const h of PLAYABLE_HEROES) for (const d of DAYS) par.set(`par/${h}/${d}`, clone(honestReference(h, d)));

function entry(key: string, hero: HeroId, day: number, deck: Build): Entry {
  const opp = `par/${other(hero)}/${day}`;
  const b = simulate(clone(deck), clone(par.get(opp)!), GOLDEN_SEED);
  return {
    key, hero, day, deck: clone(deck), opp, seed: GOLDEN_SEED,
    winner: b.winner, t: b.t, ticks: b.ticks, hulls: [b.sides[0].hull.hp, b.sides[1].hull.hp],
  };
}

const rivals: Entry[] = [];
for (const id of RIVAL_IDS) {
  for (const d of DAYS) {
    const deck = rivalBuild(id, d);
    rivals.push(entry(`rival/${id}/${d}`, deck.hero, d, deck));
  }
}
const starts = PLAYABLE_HEROES.map((h) => entry(`start/${h}`, h, 1, heroStartBuild(h)));
const pars: Entry[] = [];
for (const h of PLAYABLE_HEROES) for (const d of DAYS) pars.push(entry(`par/${h}/${d}`, h, d, par.get(`par/${h}/${d}`)!));
const standins: Entry[] = [];
for (const h of PLAYABLE_HEROES) for (const d of DAYS) standins.push(entry(`standin/${h}/${d}`, h, d, standInPick(h, d, PICK_SEED)));

const dir = resolve(process.cwd(), "tests/fixtures/golden-060");
mkdirSync(dir, { recursive: true });
const meta = {
  from: "c908f92 (0.6.0 + groundwork)", rules: RULES_VERSION, battleSeed: GOLDEN_SEED, pickSeed: PICK_SEED,
  note: "side 0 = the deck, side 1 = the other hero's par deck of the same day (par.json decks). Never edit.",
  counts: { rivals: rivals.length, starts: starts.length, par: pars.length, standins: standins.length },
};
const write = (name: string, data: unknown) => writeFileSync(resolve(dir, name), JSON.stringify(data, null, 1) + "\n");
write("meta.json", meta);
write("par.json", { decks: Object.fromEntries(par), entries: pars });
write("rivals.json", { entries: rivals });
write("starts.json", { entries: starts });
write("standins.json", { entries: standins });
const all = [...rivals, ...starts, ...pars, ...standins];
const wins = all.filter((e) => e.winner === 0).length;
console.log(`golden-060: ${all.length} entries (${rivals.length} rival, ${starts.length} start, ${pars.length} par, ${standins.length} stand-in); side-0 wins ${wins}`);
