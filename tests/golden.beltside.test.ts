// 0.6.2 BELTSIDE golden (ref/DESIGN-beltside.md): the pivot changes every battle with a gate in it, so the
// 0.6.0 identity (golden.identity.test.ts) and the races golden (races.golden.test.ts) now hold only for
// rig-free battles. This file freezes the BELTSIDE battles instead, from decks that never change: every
// golden-060 deck and its par opponent, and the races golden's warlord r5/r10 decks (the 8167743 inline
// presets, fixtures/beltside-062/inline-presets.json), each through migrateInlineGates (D3). A failure means
// the BELTSIDE battle or the migration changed. The fixture was written at the beltside M1 commit:
//   BB_GOLDEN_WRITE=1 npx vitest run tests/golden.beltside.test.ts
// Never regenerate it to make a failing run pass.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { migrateInlineGates } from "../src/sim/beltside";
import type { Build } from "../src/sim/deck";

const here = (f: string) => fileURLToPath(new URL(f, import.meta.url));
const FIXTURE = here("./fixtures/beltside-062/golden.json");
const WRITE = !!process.env.BB_GOLDEN_WRITE;
const load = <T>(f: string): T => JSON.parse(readFileSync(here(f), "utf8")) as T;

interface Entry { key: string; deck: Build; opp: string; seed: number }
const par = load<{ decks: Record<string, Build>; entries: Entry[] }>("./fixtures/golden-060/par.json");
const g060: Entry[] = [
  ...load<{ entries: Entry[] }>("./fixtures/golden-060/rivals.json").entries,
  ...load<{ entries: Entry[] }>("./fixtures/golden-060/starts.json").entries,
  ...par.entries,
  ...load<{ entries: Entry[] }>("./fixtures/golden-060/standins.json").entries,
];
const presets = new Map(load<{ decks: { key: string; deck: Build }[] }>("./fixtures/beltside-062/inline-presets.json").decks.map((d) => [d.key, d.deck]));
const SEEDS = Array.from({ length: 40 }, (_, i) => 1 + i * 7919); // = races.golden.test.ts

const migrated = (b: Build): Build => {
  const c = JSON.parse(JSON.stringify(b)) as Build;
  migrateInlineGates(c);
  return c;
};
const z = (v: number) => (v === 0 ? 0 : v); // fold -0 into 0 so JSON round-trips exactly
/** winner, end tick, player hull, enemy hull, player shots, enemy shots */
type Row = [number, number, number, number, number, number];
function fight(p: Build, e: Build, seed: number): Row {
  const b = simulate(migrated(p), migrated(e), seed);
  return [b.winner === null ? -2 : b.winner, b.ticks, z(b.sides[0].hull.hp), z(b.sides[1].hull.hp), b.sides[0].stats.shots, b.sides[1].stats.shots];
}

function warlords(): [string, Build, Build][] {
  const w = (h: string, r: number) => presets.get(`ai/warlord/${h}/${r}`)!;
  const out: [string, Build, Build][] = [];
  for (const r of [5, 10]) {
    out.push([`warlord r${r} furnace v weaver`, w("furnace", r), w("weaver", r)]);
    out.push([`warlord r${r} weaver v furnace`, w("weaver", r), w("furnace", r)]);
    out.push([`warlord r${r} furnace v furnace`, w("furnace", r), w("furnace", r)]);
    out.push([`warlord r${r} weaver v weaver`, w("weaver", r), w("weaver", r)]);
  }
  return out;
}

interface Golden { generatedAt: string; note: string; decks: Record<string, Row>; warlords: Record<string, Row[]> }

describe("beltside golden: BELTSIDE battles of the migrated golden-060 and warlord decks", () => {
  if (WRITE) {
    it("writes the golden fixture", () => {
      const g: Golden = {
        generatedAt: "beltside M1", note: "simulate(migrateInlineGates(deck), migrateInlineGates(opponent), seed). Never edit.",
        decks: Object.fromEntries(g060.map((e) => [e.key, fight(e.deck, par.decks[e.opp], e.seed)])),
        warlords: Object.fromEntries(warlords().map(([name, p, e]) => [name, SEEDS.map((s) => fight(p, e, s))])),
      };
      writeFileSync(FIXTURE, JSON.stringify(g).replace(/\],"/g, "],\n\"").replace(/\],\[/g, "],\n[") + "\n");
    });
    return;
  }
  const golden = load<Golden>("./fixtures/beltside-062/golden.json");
  it("covers every golden-060 entry and every warlord matchup for 40 seeds", () => {
    expect(Object.keys(golden.decks).sort()).toEqual(g060.map((e) => e.key).sort());
    expect(Object.keys(golden.warlords).sort()).toEqual(warlords().map(([n]) => n).sort());
  });
  it("golden-060 decks, migrated, against their migrated par opponent: identical winner, ticks, hulls and shots", () => {
    const diffs: string[] = [];
    for (const e of g060) {
      const got = fight(e.deck, par.decks[e.opp], e.seed);
      if (JSON.stringify(got) !== JSON.stringify(golden.decks[e.key])) diffs.push(`${e.key}: got ${JSON.stringify(got)} want ${JSON.stringify(golden.decks[e.key])}`);
    }
    expect(diffs).toEqual([]);
  });
  for (const [name, p, e] of warlords()) {
    it(`${name}: 40 seeds`, () => {
      const want = golden.warlords[name];
      SEEDS.forEach((seed, i) => expect({ seed, got: fight(p, e, seed) }).toEqual({ seed, got: want[i] }));
    });
  }
});
