// FIELD-1 (REQ-BFG-075): the battle settings and their pick (src/render/scenery.ts). Display only: a hash of the battle's
// seed picks the medium (a third each), then a setting within it (evenly); the replay plays the record's seed, so it shows
// the battle's setting; the title's attract fight walks the settings in turn; the still screens keep the day's sea.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ATTRACT_SCENES, MEDIA, MEDIUM_ORDER, SCENE_NAME, attractScene, battleScene, forceScene, forcedScene, mediumOf, sceneForSeed,
  type Medium,
} from "../src/render/scenery";
import { SCENE_IDS, isSceneId, parseMotionOpts, seaForDay } from "../src/render/motion";
import { LANDS, SEAS, SeaBackdrop, isSea } from "../src/render/backdrop";
import { battleRecordFor } from "../src/net/replay";
import { openReplay } from "../src/game/replays";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { battleSeed, newRun } from "../src/game/run";

describe("FIELD-1 the battle settings and their pick (REQ-BFG-075)", () => {
  it("eight settings in three media: WATER's are the seas (renamed), GROUND three, AIR two; each named in capitals", () => {
    expect(SCENE_IDS.length).toBe(8);
    expect([...MEDIA.water, ...MEDIA.ground, ...MEDIA.air].sort()).toEqual([...SCENE_IDS].sort());
    expect(MEDIA.water).toEqual(["calm", "storm", "ember"]);
    expect(MEDIA.ground).toEqual(["forest", "desert", "badlands"]);
    expect(MEDIA.air).toEqual(["sky", "clouds"]);
    expect(SCENE_IDS.map((s) => SCENE_NAME[s])).toEqual(["OPEN SEA", "STORM SEA", "EMBER SEA", "FOREST", "DESERT", "BADLANDS", "SKY", "STORM CLOUDS"]);
    for (const s of SCENE_IDS) {
      expect(SCENE_NAME[s], s).toBe(SCENE_NAME[s].toUpperCase());
      expect(MEDIA[mediumOf(s)].includes(s), s).toBe(true);
      expect(isSceneId(s)).toBe(true);
      expect(isSea(s)).toBe(mediumOf(s) === "water");
    }
    // the water settings keep the seas' art (and keys: the ids are the seas'); every other setting has its own look
    for (const s of MEDIA.water) expect(SeaBackdrop.look(s)).toBe(SEAS[s as "calm"]);
    for (const s of [...MEDIA.ground, ...MEDIA.air]) expect(SeaBackdrop.look(s)).toBe(LANDS[s as "forest"]);
    expect(isSceneId("lava")).toBe(false);
  });

  it("the same seed gives the same setting; over 30,000 seeds each medium lands within 2 points of a third, each setting evenly within its medium", () => {
    for (const seed of [0, 1, 7, 12345, 0x7fffffff, -5, 2 ** 32 - 1]) expect(sceneForSeed(seed)).toBe(sceneForSeed(seed));
    const N = 30000;
    const media: Record<Medium, number> = { water: 0, ground: 0, air: 0 };
    const each: Record<string, number> = {};
    for (let seed = 0; seed < N; seed++) {
      const s = sceneForSeed(seed);
      media[mediumOf(s)]++;
      each[s] = (each[s] ?? 0) + 1;
    }
    for (const m of MEDIUM_ORDER) {
      expect(Math.abs((100 * media[m]) / N - 100 / 3), `${m}: ${media[m]} of ${N}`).toBeLessThanOrEqual(2);
      for (const s of MEDIA[m]) expect(Math.abs(each[s] / media[m] - 1 / MEDIA[m].length), `${s} in ${m}`).toBeLessThanOrEqual(0.02);
    }
    // the run's own seeds too (hashed battle seeds, as battleSeed makes them): every medium shows up
    const seen = new Set<Medium>();
    for (let r = 1; r <= 60; r++) for (let d = 1; d <= 10; d++) seen.add(mediumOf(sceneForSeed(battleSeed({ ...newRun("furnace", r), day: d }))));
    expect([...seen].sort()).toEqual(["air", "ground", "water"]);
  });

  it("a battle and its replay agree: the record keeps the battle's seed, and the replay picks from it", () => {
    for (let r = 1; r <= 12; r++) {
      const run = { ...newRun("weaver", 100 + r), day: 1 + (r % 10) };
      const seed = battleSeed(run);
      const rec = battleRecordFor(startingBuild("weaver", run.day), warlordBuild("furnace", 2), seed);
      const o = openReplay(rec);
      expect(o.ok).toBe(true);
      if (!o.ok) continue;
      expect(o.battle.record.seed).toBe(seed);
      expect(battleScene(o.battle.record.seed)).toBe(battleScene(seed));
    }
    // and the screens pick that way: the battle from its seed, the replay from the record's
    const battle = readFileSync(new URL("../src/screens/battle.ts", import.meta.url), "utf8");
    const replay = readFileSync(new URL("../src/screens/replay.ts", import.meta.url), "utf8");
    expect(battle).toMatch(/new ArenaMotion\(this\.seed, battleScene\(this\.seed\)/);
    expect(replay).toMatch(/this\.seed = battle\.record\.seed;/);
    expect(replay).toMatch(/new ArenaMotion\(this\.seed, battleScene\(this\.seed\)/);
  });

  it("the tooling's forced setting (bb.scene) wins until cleared; nothing in play sets it", () => {
    expect(forcedScene()).toBe(null);
    forceScene("desert");
    expect([1, 2, 3].map(battleScene)).toEqual(["desert", "desert", "desert"]);
    forceScene(null);
    expect(battleScene(12345)).toBe(sceneForSeed(12345));
    // only the page tooling (main.ts bb.scene) calls forceScene
    for (const f of ["src/screens/battle.ts", "src/screens/replay.ts", "src/screens/title.ts", "src/game/arenaMotion.ts", "src/game/game.ts"]) {
      expect(readFileSync(new URL(`../${f}`, import.meta.url), "utf8").includes("forceScene"), f).toBe(false);
    }
    expect(readFileSync(new URL("../src/main.ts", import.meta.url), "utf8")).toMatch(/forceScene\(isSceneId\(id\) \? id : null\)/);
  });

  it("the title's attract fight walks the settings: all three media in its first three rounds (OPEN SEA first), all eight in eight", () => {
    expect(attractScene(0)).toBe("calm");
    expect(new Set([0, 1, 2].map((n) => mediumOf(attractScene(n)))).size).toBe(3);
    expect([...ATTRACT_SCENES].sort()).toEqual([...SCENE_IDS].sort());
    expect(attractScene(8)).toBe(attractScene(0));
  });

  it("the still screens keep the day's sea; the test builds' ?sea= knob takes any setting", () => {
    expect([1, 3, 4, 7, 8, 10].map(seaForDay)).toEqual(["calm", "calm", "storm", "storm", "ember", "ember"]);
    for (const s of SCENE_IDS) expect(parseMotionOpts(`?sea=${s}`, true).sea).toBe(s);
    expect(parseMotionOpts("?sea=desert", false).sea).toBe(null); // a player build: the URL changes nothing
  });

  it("the pick module imports nothing from src/sim and uses no Math.random", () => {
    for (const f of ["src/render/scenery.ts"]) {
      const raw = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(/\/sim\//.test(src), f).toBe(false);
      expect(src.includes("Math.random"), f).toBe(false);
      expect(/core\/rng/.test(src), f).toBe(false);
    }
  });
});
