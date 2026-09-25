// 0.6.2 BELTSIDE M4 (ref/DESIGN-beltside.md §10, D4): the preset decks place rigs natively. Every rig of an ai
// warlord, hero/race reference, race start and rival captain deck stands beside the belt tile its 0.6.1 inline
// gate stood on (the decks frozen from 8167743 in fixtures/beltside-062/inline-presets.json) and works exactly
// that tile and no other belt tile, so the preset keeps its hits: the payload meets the same processing in the
// same order as before the pivot. Race reference decks later bought matching copies that auto-merge; the
// surviving rigs keep their native cells and hits, and the cost still includes every purchase. The D3
// migration at each load boundary is a no-op.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { clearMigrationLog, migrateInlineGates, migrationLog } from "../src/sim/beltside";
import { ITEMS, type HeroId } from "../src/sim/content";
import { hitsOfRig, key as K, rigHits, type Build } from "../src/sim/deck";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { fuseDeck } from "../src/sim/harness/merge";
import { raceRefBuild, raceStartBuild } from "../src/sim/races/refBuilds";
import type { RaceHeroId } from "../src/sim/races/data";
import { rivalBuild, standInBuild, type RivalId } from "../src/sim/rivals";
import { buildCost } from "../src/net/validate";

interface Rec { source: string; key: string; hero: HeroId; day: number; deck: Build }
const inline = (JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/beltside-062/inline-presets.json", import.meta.url)), "utf8")) as { decks: Rec[] }).decks;

/** The live builder behind a fixture key. */
function live(key: string): Build {
  const [kind, sub, id, d] = key.split("/");
  const day = Number(d);
  if (kind === "ai") return sub === "start" ? startingBuild(id as HeroId, 1) : warlordBuild(id as HeroId, day);
  if (kind === "hero") return sub === "start" ? heroStartBuild(id as HeroId, 1) : heroRefBuild(id as HeroId, day);
  if (kind === "race") return sub === "start" ? raceStartBuild(id as RaceHeroId, 1) : raceRefBuild(id as RaceHeroId, day);
  if (kind === "rival") return sub === "warlord" ? rivalBuild(id as RivalId, day) : standInBuild(id as RivalId, day);
  throw new Error(`unknown preset key ${key}`);
}

/** The frozen 0.6.1 race references still held unfused pairs. Compare their 0.6.2 builds
 *  with those same purchases after the game's fusion rule, keeping the surviving rig's old hit. */
function expectedDeck(r: Rec): Build {
  return /^(race|hero)\/ref\/(foundry|bastion|metronome|siphon)\//.test(r.key)
    ? fuseDeck(r.deck).build
    : r.deck;
}

const rigsOf = (b: Build) => b.items.filter((p) => ITEMS[p.def].kind === "gate");
const machinery = (b: Build) => b.items.filter((p) => ITEMS[p.def].kind !== "gate").map((p) => JSON.stringify(p)).sort();
// E2 intentionally rewrites live captain plans and Weaver par purchases. The inline fixtures remain the
// historical BELTSIDE port oracle; the live replacements have their own legality and hit checks.
const rewritten = (key: string) => key.startsWith("rival/") || /^(ai\/warlord|hero\/ref)\/weaver\/(7|8|9|10)$/.test(key);

describe("BELTSIDE M4: native rig placement in every preset deck", () => {
  it("covers every frozen preset deck", () => {
    expect(inline.length).toBe(392);
    expect(new Set(inline.map((r) => r.source))).toEqual(new Set(["preset:ai", "preset:hero", "preset:race", "preset:rival"]));
  });

  it("every preset is native: the load-boundary migration moves and drops nothing, and no rig stands on a belt", () => {
    clearMigrationLog();
    const bad: string[] = [];
    for (const r of inline) {
      const b = live(r.key);
      const belt = new Set(b.routes.flatMap((q) => q.cells));
      for (const p of rigsOf(b)) if (belt.has(K(p.x, p.y))) bad.push(`${r.key}: ${p.def} uid ${p.uid} on a belt tile`);
      const again = JSON.parse(JSON.stringify(b)) as Build;
      if (migrateInlineGates(again).moved.length) bad.push(`${r.key}: migration still moves a rig`);
    }
    expect(bad).toEqual([]);
    expect(migrationLog().stats.filter((s) => s.source.startsWith("preset:"))).toEqual([]);
  });

  it("unchanged live presets keep each surviving rig on its original belt hit", () => {
    const bad: string[] = [];
    let rigs = 0;
    for (const r of inline) {
      if (rewritten(r.key)) continue;
      const b = live(r.key);
      const prior = expectedDeck(r);
      const hits = rigHits(b);
      // The same purchases and routes, after the live fusion rule for race references.
      if (JSON.stringify(machinery(b)) !== JSON.stringify(machinery(prior))) bad.push(`${r.key}: machinery differs`);
      if (JSON.stringify([b.routes, b.mods, b.beltCap, b.hullBonus]) !== JSON.stringify([prior.routes, prior.mods, prior.beltCap, prior.hullBonus])) bad.push(`${r.key}: routes, mods, belt or hull differ`);
      const was = rigsOf(prior);
      if (JSON.stringify(rigsOf(b).map((p) => [p.uid, p.def, p.stars ?? 1]).sort()) !== JSON.stringify(was.map((p) => [p.uid, p.def, p.stars ?? 1]).sort())) bad.push(`${r.key}: fused rigs differ`);
      if (buildCost(b).total !== buildCost(prior).total) bad.push(`${r.key}: cost ${buildCost(b).total} != ${buildCost(prior).total}`);
      for (const old of was) {
        rigs++;
        const want = K(old.x, old.y);
        const got = hitsOfRig(b, old.uid, hits).map((h) => h.cell);
        if (got.length !== 1 || got[0] !== want) bad.push(`${r.key}: ${old.def} uid ${old.uid} hits [${got.join(",")}], want [${want}]`);
      }
    }
    expect(bad).toEqual([]);
    expect(rigs).toBeGreaterThan(100);
  });

});
