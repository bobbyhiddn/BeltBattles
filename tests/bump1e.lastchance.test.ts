// BUMP-1E C2 (REQ-BFG-073; the plan's "list which of the twelve enter LAST CHANCE's epic offers, and check that the server's
// seeded-offer check accepts each one"). With SCALE_RIGS on, lastChanceParts() (the PART card's catalogue: the buyable epic rigs,
// turrets and gear) holds TROPHY CHAIN, the one epic of the twelve (IRON WALL is a legendary, the rest rare or common). For EVERY part
// of that catalogue an honest upload that took it (the par player's own run with the card, as tests/lc1.server.test.ts builds them)
// passes the server's check (validateUpload: the seeded offer, the free part's price out of the budget), and the same upload naming
// another part is refused with the offer's own line. The run seed is searched so that the offer IS that part (the part's draw is the
// run seed's and the day's alone). Synchronously only; the scaling switch is the shipped one (on).
import { describe, expect, it } from "vitest";
import { ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { SCALE_PIECES, heartsLost, scaleRules } from "../src/sim/scale";
import { canPlaceItem, cloneBuild, type Build } from "../src/sim/deck";
import { lastChanceOffer, lastChanceParts } from "../src/sim/lastChance";
import { openRunesRules } from "../src/sim/openRunes";
import { parRunSeed, partSaleHull, playerRun } from "../src/sim/harness/player"; // BUMP-1F (R12.2): + partSaleHull
import { MAX_LIVES, SNAPSHOT_V3, decodeSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { heartsLostCapFor } from "../src/net/rulesGate"; // BUMP-1E R1.3
import { isReachable, reachableRecords } from "../src/net/records";
import { battleRecordFor, checkRecord } from "../src/net/replay";

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

// BUMP-1F (RULING-BUMP1F-R12 R12.2) KNOWN LIMITATION, class OTHER: the par bot books a MODELED sale of a LAST CHANCE part it cannot place as hull (src/sim/harness/player.ts lastChanceCard: `if (!put.placed) run.build.hullBonus +=
// partSaleHull(...)`, floor(sale value x armor pack hull per gold): a fraction of a 250-hull plate). A human holds hull only in whole plates plus the road's events (a dock +200, RIDE THROUGH -100, the shrine's OFFER HULL -100), so
// the SERVER IS RIGHT to refuse such a deck and the bot is wrong; the bot's files are in the generators' closure (R5.1), so it is not fixed in bb-0.13.0 (next rules release's list). The first test visits one (hero, seed) a part
// (the first seed whose offer on day 6 is that part): with GATES and ENCHANT on, three of the nine boards have no spot for the part the test makes the bot take, so it is sold: the par weaver's seed 1 with SPLITTER (hullBonus 1600 =
// 6 plates (1,500) + the bot's 100: the check says "supply: hullBonus 1600 needs dock PLATING + ..., which this run's seed did not offer by day 7 (its road: trader, sappers, smuggler, cache, storm, wreck, herald)"), the par bastion's
// seed 3 with SORTING (1850) and the par foundry's seed 1 with CHAMBER (1600); the test failed on the first alone, run 5's list, and the other two came out when the first was narrowed: the same one cause. Measured at 65fc803 with the server's own check (validateUpload): the 192 seed-pool ghosts (ab591cc9e199): all
// carry a seed and a road log, 192 accepted, 0 refused; the P5 bench's 384 par runs: LAST CHANCE fired in 67, the PART card in 33, all 33 decks accepted; the FORCED sweep (4 heroes, LAST CHANCE on day 6 and 9, seeds 1-48, the PART card
// taken: 384 decks): 25 refused, all by this one cause; par P(10 wins) with the sale hull refused (or only whole plates of it), K 48 a hero (192 runs): 84.9% (163), 0 runs differ at all (0.00 points). The case is narrowed to
// this seed and this cause only: the server must still refuse the deck for exactly that supply line (so a fix of the bot turns this red and whoever sees it restores the strict check), and the deck without the sale hull must pass.
const BOT_SALE_HULL: { part: string; hero: HeroId; seed: number }[] = [
  { part: "splitter", hero: "weaver", seed: 1 }, { part: "sorting", hero: "bastion", seed: 3 }, { part: "chamber", hero: "foundry", seed: 1 },
];

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
      let s = honestPart(hero, seed);
      expect(s.lastChance, p.id).toEqual({ day: D, boon: "part", id: p.id });
      const v = check(s);
      if (BOT_SALE_HULL.some((c) => c.part === p.id && c.hero === hero && c.seed === seed)) {
        // BUMP-1F (RULING-BUMP1F-R12 R12.2): the bot's modeled sale hull (see BOT_SALE_HULL): refused for exactly that supply line, accepted without it
        expect(v.ok, `${p.id} (${hero} seed ${seed}): the bot's sale hull is still booked (a fix of the bot turns this red: restore the strict check)`).toBe(false);
        expect(v.errors.length, v.errors.join("; ")).toBe(1);
        expect(v.errors[0], p.id).toMatch(/^supply: hullBonus \d+ needs .* which this run's seed did not offer by day \d+ \(its road: /);
        const stars = lastChanceOffer(parRunSeed(hero, seed), D, hero, (playerRun(hero, D, seed)[D - 1].build.runes ?? []).map((q) => q.id), openRunesRules()).partStars ?? 1;
        const sale = partSaleHull(p.id, stars);
        expect(sale, `${p.id}: the sale hull is not a whole plate`).toBeGreaterThan(0);
        s = { ...s, build: { ...s.build, hullBonus: s.build.hullBonus - sale } };
        const w = check(s);
        expect(w.ok, `${p.id} (${hero} seed ${seed}) without the bot's sale hull ${sale}: ${w.ok ? "" : w.errors.join("; ")}`).toBe(true);
      } else expect(v.ok, `${p.id} (${hero} seed ${seed}): ${v.ok ? "" : v.errors.join("; ")}`).toBe(true);
      const wrong = lastChanceParts().find((d) => d.id !== p.id)!.id;
      expect(check({ ...s, lastChance: { day: D, boon: "part", id: wrong } }).errors, p.id).toEqual([`lastChance: part ${wrong} was not in the LAST CHANCE offer of day ${D} (it offered ${p.id})`]);
    }
  }, 300_000);
});

// BUMP-1E R1.3 (RULING-BUMP1E-R1 R1.3; test-only unless it finds a bug): GRUDGE ROD (it reads the hearts lost) and LAST CHANCE are live together for
// the first time in this release. An honest run that took LAST CHANCE (day 6, the HULL card) holds the fewest hearts a run can hold after it, 1: it has
// lost 9 of its 10, and a GRUDGE ROD aboard reads 9 (scale.ts heartsLost). At the fights of days 10 and 16 (the deepest of that run's fights its
// decks cover) its upload must pass validateUpload, the strict decode and the record check (isReachable with `lastChance` and `losses`), and its
// battle record must pass checkRecord with the switch on; the hearts lost it states (the snapshot's lives, its dusks lost, the record's `lost`)
// must not exceed heartsLostCapFor. Synchronously only; the scaling switch is the shipped one (on).
describe("BUMP-1E R1.3: GRUDGE ROD and LAST CHANCE together, at the fewest hearts", () => {
  const LC_DAY = 6, HERO: HeroId = "furnace", FOE: HeroId = "weaver", SEED = 1;

  /** The par player's deck of `day` in a run that took the HULL card on LC_DAY, its gate rigs taken off (room and gold, as tests/scale2d.server.test.ts baseDeck
   *  does) and one GRUDGE ROD on the first free cell. */
  function rodDeck(day: number): Build {
    const b = cloneBuild(playerRun(HERO, 16, SEED, { lastChance: { day: LC_DAY, boon: "hull" } })[day - 1].build);
    b.items = b.items.filter((p) => ITEMS[p.def].kind !== "gate");
    // a uid is unique across the rigs, the gun parts and the turrets (validateBuild: "uid N is used twice")
    const uid = Math.max(0, ...b.items.map((p) => p.uid), ...b.mods.map((m) => m.uid), ...(b.turrets ?? []).map((t) => t.uid)) + 1;
    for (let y = 1; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (canPlaceItem(b, "grudgerod", x, y, -1, 0).ok) {
          b.items.push({ uid, def: "grudgerod", x, y });
          return b;
        }
      }
    }
    throw new Error(`no free cell for a grudgerod on day ${day}`);
  }

  it("the upload passes validateUpload, the strict decode and the record check, and the battle record passes checkRecord, with hearts lost at the cap", () => {
    expect(scaleRules()).toBe(true);
    const cap = heartsLostCapFor(RULES_VERSION, MAX_LIVES);
    expect(cap).toBe(9); // 10 hearts less the one a run at 0 does not have
    const runSeed = parRunSeed(HERO, SEED);
    for (const day of [10, 16]) {
      // the record: LAST CHANCE fired on LC_DAY, the run at its fewest hearts (1), the most wins such a run can carry into the dusk
      const atOne = reachableRecords(day, { lastChance: LC_DAY }).filter((r) => r.lives === 1);
      expect(atOne.length, `day ${day}: a run at 1 heart after its LAST CHANCE on day ${LC_DAY}`).toBeGreaterThan(0);
      const rec = atOne.reduce((a, b) => (b.wins > a.wins ? b : a));
      // the dusks it states it lost: the most the model reaches for that record (the rest of the days are draws)
      let losses = -1;
      for (let l = day - 1 - rec.wins; l >= 0 && losses < 0; l--) if (isReachable(day, rec.wins, 1, { lastChance: LC_DAY, losses: l })) losses = l;
      expect(losses, `day ${day}: no losses count reaches ${rec.wins}W 1 heart`).toBeGreaterThanOrEqual(0);
      const build = rodDeck(day);
      expect(build.items.some((p) => p.def === "grudgerod"), `day ${day}`).toBe(true);
      const s: GhostSnapshot = {
        v: SNAPSHOT_V3, rules: RULES_VERSION, hero: HERO, day, wins: rec.wins, lives: 1, losses, build, runId: `bump1e-grudge-${HERO}-${day}`,
        playerId: "p-bump1e-grudge", createdAt: 1_790_000_000_000, seed: runSeed, lastChance: { day: LC_DAY, boon: "hull" },
      };
      // the upload: the deck's check (the seeded runes, the budget, the HULL card's hull), the strict decode, the record check
      const v = check(s);
      expect(v.ok, `day ${day}: ${v.ok ? "" : v.errors.join("; ")}`).toBe(true);
      expect(() => decodeSnapshot(JSON.stringify(s)), `day ${day}: decode`).not.toThrow();
      expect(isReachable(s.day, s.wins, s.lives, { lastChance: LC_DAY, losses }), `day ${day}: ${rec.wins}W 1 heart, ${losses} losses`).toBe(true);
      // the battle record the dusk fight stores (side 0 the player, side 1 a ghost 3 hearts down): the GRUDGE ROD makes it keep both counts
      const foe = playerRun(FOE, 16, SEED)[day - 1].build;
      const lost: [number, number] = [heartsLost(s.lives), heartsLost(3)];
      expect(lost[0], `day ${day}: the fewest hearts is 9 lost`).toBe(9);
      const record = battleRecordFor(build, foe, 7, [s.wins, 4], day, lost);
      expect(record.lost, `day ${day}`).toEqual(lost);
      expect(() => checkRecord(record), `day ${day}: checkRecord`).not.toThrow();
      // the control: one more heart lost than the cap is refused (so the check above is live). The record's shape check (checkWins, 0..WIN_GOAL - 1 = 0..9, which
      // `lost` shares) answers first; readCountsProblem's own cap (`past 9`) is the same bound by another road
      expect(() => checkRecord({ ...record, lost: [cap + 1, lost[1]] }), `day ${day}: ${cap + 1} hearts lost`).toThrow(/wins must be integers in 0\.\.9|hearts lost 10 is past 9/);
      // the hearts lost it states do not exceed the cap
      expect(heartsLost(s.lives), `day ${day}: from its lives`).toBeLessThanOrEqual(cap);
      expect(s.losses!, `day ${day}: its dusks lost`).toBeLessThanOrEqual(cap);
      expect(record.lost![0], `day ${day}: the record's own`).toBeLessThanOrEqual(cap);
    }
  }, 600_000);
});
