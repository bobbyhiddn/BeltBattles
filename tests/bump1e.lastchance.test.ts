// BUMP-1E C2 (REQ-BFG-073; the plan's "list which of the twelve enter LAST CHANCE's epic offers, and check that the server's
// seeded-offer check accepts each one"). With SCALE_RIGS on, lastChanceParts() (the PART card's catalogue: the buyable epic rigs,
// turrets and gear) holds TROPHY CHAIN, the one epic of the twelve (IRON WALL is a legendary, the rest rare or common). For EVERY part
// of that catalogue an honest upload that took it (the par player's own run with the card, as tests/lc1.server.test.ts builds them)
// passes the server's check (validateUpload: the seeded offer, the free part's price out of the budget), and the same upload naming
// another part is refused with the offer's own line. The run seed is searched so that the offer IS that part (the part's draw is the
// run seed's and the day's alone). Synchronously only; the scaling switch is the shipped one (on).
import { describe, expect, it } from "vitest";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { SCALE_PIECES, scaleRules } from "../src/sim/scale";
import { lastChanceOffer, lastChanceParts } from "../src/sim/lastChance";
import { openRunesRules } from "../src/sim/openRunes";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";

const D = 6; // the LAST CHANCE day (tests/lc1.server.test.ts: the hearts rule's first)
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

const check = (s: GhostSnapshot) => validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}) });

/** The first (hero, par seed) whose LAST CHANCE offer on day D is `part`. */
function seedFor(part: string): { hero: HeroId; seed: number } {
  for (let seed = 1; seed <= 400; seed++) {
    for (const hero of HEROES) {
      if (lastChanceOffer(parRunSeed(hero, seed), D, hero, [], openRunesRules()).part === part) return { hero, seed };
    }
  }
  throw new Error(`no par seed offers ${part} on day ${D} in 400 seeds`);
}

/** An honest upload at the dusk after a LAST CHANCE on day D that took the PART card (tests/lc1.server.test.ts honest("part")). */
function honestPart(hero: HeroId, seed: number): GhostSnapshot {
  const runSeed = parRunSeed(hero, seed);
  const before = playerRun(hero, D, seed)[D - 1].build;
  const offer = lastChanceOffer(runSeed, D, hero, (before.runes ?? []).map((q) => q.id), openRunesRules());
  const build = playerRun(hero, D + 1, seed, { lastChance: { day: D, boon: "part" } })[D].build;
  return {
    v: SNAPSHOT_V3, rules: RULES_VERSION, hero, day: D + 1, wins: 0, lives: 1, build, runId: `bump1e-lc-${hero}-${seed}`,
    playerId: "p-bump1e-lc", createdAt: 1_790_000_000_000, seed: runSeed, lastChance: { day: D, boon: "part", id: offer.part! },
  };
}

describe("BUMP-1E C2: LAST CHANCE's PART card with the twelve", () => {
  it("ships on; TROPHY CHAIN is the one epic of the twelve and so the one that joins the PART card's catalogue", () => {
    expect(scaleRules()).toBe(true);
    const ids = lastChanceParts().map((d) => d.id);
    expect(ids.filter((id) => SCALE_PIECES.includes(id))).toEqual(["trophychain"]);
    // the catalogue as BUMP-1E measured it: nine epic parts (the bump's eight and TROPHY CHAIN)
    expect([...ids].sort()).toEqual(["chamber", "hailgun", "pickaxe", "platebreaker", "railgun", "siegegun", "sorting", "splitter", "trophychain"]);
  });

  it("the server's seeded-offer check accepts an honest upload that took each of them, and refuses another part naming the offer", () => {
    for (const p of lastChanceParts()) {
      const { hero, seed } = seedFor(p.id);
      const s = honestPart(hero, seed);
      expect(s.lastChance, p.id).toEqual({ day: D, boon: "part", id: p.id });
      const v = check(s);
      expect(v.ok, `${p.id} (${hero} seed ${seed}): ${v.ok ? "" : v.errors.join("; ")}`).toBe(true);
      const wrong = lastChanceParts().find((d) => d.id !== p.id)!.id;
      expect(check({ ...s, lastChance: { day: D, boon: "part", id: wrong } }).errors, p.id).toEqual([`lastChance: part ${wrong} was not in the LAST CHANCE offer of day ${D} (it offered ${p.id})`]);
    }
  }, 300_000);
});
