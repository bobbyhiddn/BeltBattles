// Harness v2 part 2, step 3 (REQ-BFG-005, REQ-BFG-019): the wave-1 mods (HOPPER, MANTLET, FINISHER RAM) and the
// six star perks of 0.6.1p reach the harness only through the game's own code (stars.ts effectAt/perkAt and the
// sim, which reads effectAt: battle.ts:259, :290, :921; cores.ts:55; deck.ts:280, :286). The harness copies no
// value: it only sets `stars` on a placement and calls simulate.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { ITEMS } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { validateBuild } from "../src/net/validate";
import { effectAt, fusible, pendingAt, perkAt } from "../src/sim/stars";
import { randomBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES, heroStartBuild, shopItems } from "../src/sim/harness/heroes";
import { DEFAULT_OPTS, coreUseOf, starBench, type DetailRunner, type Runner } from "../src/sim/harness/tournament";

const NEW_MODS = ["hopper", "mantlet", "ram"] as const;
const PERK_MODULES = ["longhaul", "coil", "splitter", "overdrive", "press", "chamber"] as const; // 0.6.1p M1

describe("the wave-1 mods and the star perks (0.6.1p)", () => {
  it("HOPPER, MANTLET and FINISHER RAM are kind mod with a merchant, so the v1 (stars-off) shopper buys them: every hero's mod pool offers them, and stars-off builds hold each", () => {
    for (const hero of HARNESS_HEROES) expect(shopItems(hero, "mod").map((d) => d.id)).toEqual(expect.arrayContaining([...NEW_MODS]));
    const seen: Record<string, number> = { hopper: 0, mantlet: 0, ram: 0 };
    for (const hero of HARNESS_HEROES) {
      for (const day of [3, 5, 7, 10]) {
        for (let i = 0; i < 5; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("new-mods", hero, day, i)), "off");
          for (const m of b.mods) if (m.def in seen) seen[m.def]++;
        }
      }
    }
    for (const d of NEW_MODS) expect(seen[d], d).toBeGreaterThan(0);
  });

  it("every live fusible def stores no pending value at c432bee (pendingAt is {}), and the nine perk/new-mod defs change at 2 and 3 stars through effectAt", () => {
    for (const d of Object.values(ITEMS)) {
      if (!fusible(d.id)) continue;
      expect(pendingAt(d.id, 2), d.id).toEqual({});
      expect(pendingAt(d.id, 3), d.id).toEqual({});
    }
    for (const def of [...PERK_MODULES, ...NEW_MODS]) {
      const one = JSON.stringify(effectAt(def, 1));
      expect(JSON.stringify(effectAt(def, 2)), `${def} 2 stars`).not.toBe(one);
      expect(JSON.stringify(effectAt(def, 3)), `${def} 3 stars`).not.toBe(one);
    }
    // 0.6.1f M1: SPLITTER's 3-star perk is PERFECT CUT {copies 2, mult 0.85}; THREE-WAY is retired
    expect([perkAt("coil", 2), perkAt("splitter", 3), perkAt("chamber", 2), perkAt("press", 3), perkAt("overdrive", 3), perkAt("hopper", 3)])
      .toEqual(["SPARK JUMP", "PERFECT CUT", "WIDE BREECH", "MASTER DIES", "AFTERBURNER", "BOTTOMLESS"]);
  });

  it("the harness copies no star value: no file in src/sim/harness reads ItemDef.levels, a pending value or a perk field, or names a perk", () => {
    const dir = fileURLToPath(new URL("../src/sim/harness/", import.meta.url));
    const perks = new Set<string>();
    for (const d of Object.values(ITEMS)) for (const n of [2, 3] as const) { const p = d.levels?.[n]?.perk; if (p) perks.add(p); }
    expect(perks.size).toBeGreaterThanOrEqual(10);
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(dir + f, "utf8");
      expect(/\.levels\b|\.pending\b|\bpendingAt\b|\beffectAt\b/.test(src), `${f} reads star values itself`).toBe(false);
      for (const p of perks) expect(src.includes(p), `${f} names the perk ${p}`).toBe(false);
    }
  });

  it("bench rows carry the perk name from the game's perkAt (report only)", async () => {
    const b = heroStartBuild("furnace", 1);
    b.mods.push({ uid: 900, def: "hopper", turret: 0 });
    const run: Runner = async (_f, jobs) => jobs.map(() => 1);
    const det: DetailRunner = async (_f, jobs) => jobs.map((j) => j.seeds.join(","));
    const { rows } = await starBench({ ...DEFAULT_OPTS, seeds: 1 }, 5, [heroStartBuild("weaver", 1)], [{ hero: "furnace", tag: "t", build: b }], run, det);
    expect(rows.find((r) => r.def === "hopper" && r.star === 3)!.perk).toBe(perkAt("hopper", 3));
    expect(rows.find((r) => r.def === "hopper" && r.star === 2)!.perk).toBe(perkAt("hopper", 2));
  });

  it("FINISHER RAM under a GATLING SPOOL core is legal (the game doesn't forbid it) and is counted, per turret", () => {
    const b: Build = heroStartBuild("weaver", 1);
    b.mods.push({ uid: 900, def: "gatling", turret: 0 }, { uid: 901, def: "ram", turret: 0 }, { uid: 902, def: "gatling", turret: 1, stars: 2 }, { uid: 903, def: "ram", turret: 2, stars: 2 }); // the 2nd RAM is 2 stars: two 1-star RAMs are an unmerged pair since the flip
    expect(validateBuild(b, 10).errors).toEqual([]);
    const u = coreUseOf([b, heroStartBuild("furnace", 1)]);
    expect(u).toMatchObject({ builds: 2, withCore: 1, cores: 2, ramOnGatling: 1, byDef: { gatling: 2 }, stars: [1, 1, 0] });
  });
});
