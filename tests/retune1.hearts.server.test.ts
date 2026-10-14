// RETUNE-1 (REQ-BFG-096): the hearts record model (src/net/records.ts heartsRecords, behind rulesGate.ts heartsFor) and
// the server's checks that follow it: the strict decoder's and the client's lives bound (rulesGate.ts livesCapFor), the
// match route's bound, POST /v1/ghosts's record check, the seed step (server/seed.ts checkPool) and ghosts:admin
// revalidate (both read the record's own rules). Honest decks are the par player's runs (player.ts playerRun, with
// opts.lastChance for a LAST CHANCE card), as tests/lc1.server.test.ts builds them. HEARTS is set through its setter and
// put back off after each test. The server's data dir is under os.tmpdir() (run with TMPDIR set).
// HULL-ON (the flip, HEARTS): HEARTS ships on, so the afterEach puts it back ON (the shipped value) and each switch-off
// half sets it off itself (withHearts(fn, false)); the switch-on tests are plain tests.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { HEARTS_START, setHearts, withHearts } from "../src/sim/hearts";
import { openRunesRules } from "../src/sim/openRunes"; // HULL-ON (the flip, OPEN_RUNES): the par player's card rule
import { lastChanceOffer, type Boon } from "../src/sim/lastChance";
import { runeFits, runeList } from "../src/sim/runes";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { checkSnapshot, decodeSnapshot, encodeSnapshot, MAX_LIVES, SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { HEARTS_RULES, heartsFor, livesCapFor } from "../src/net/rulesGate";
import { validateUpload } from "../src/net/validate";
import { floorRecord, isReachable, reachableRecords } from "../src/net/records";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { submitGhost } from "../src/net/ghostClient";
import { createGhostServer, parseMatchQuery, type GhostServer } from "../server/app";
import { checkPool } from "../server/seed";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

/** A rules version before HEARTS_RULES (it stays older after the bump; LAST CHANCE predates it too). */
const OLD_RULES = "bb-0.9.1";
const LC_DAY = 6; // a run that loses every dusk: 9 8 7 5 3, then 1 at dusk 6: LAST CHANCE (the earliest it can fire)
afterEach(() => setHearts(true)); // the shipped value (HULL-ON's flip; was false): a switch-off half sets it off itself

const recs = (day: number, opts = {}) => reachableRecords(day, opts).map((r) => `${r.wins}W${r.lives}`).join(" ");

/** An honest hearts upload: the par player's deck. Without a card: day 6, 0 wins, 3 hearts (days 1-5 lost). With one:
 *  day 7, 0 wins, 1 heart, the card taken at the dawn of day 7 after LAST CHANCE on day 6. */
function honest(boon: Boon | null, hero: HeroId = "furnace", seed = 5): GhostSnapshot {
  const runSeed = parRunSeed(hero, seed);
  const base = { v: SNAPSHOT_V3, rules: RULES_VERSION, hero, wins: 0, runId: `rt1-${hero}-${seed}-${boon ?? "none"}`, playerId: "p-rt1", createdAt: 1_790_000_000_000, seed: runSeed } as const;
  if (!boon) return { ...base, day: 6, lives: 3, build: playerRun(hero, 6, seed)[5].build };
  const before = playerRun(hero, LC_DAY, seed)[LC_DAY - 1].build;
  // HULL-ON (the flip, OPEN_RUNES): the par player takes the card on the switch's offer rule (open: no runeFits filter),
  // the rule the server re-derives for this build's rules (openRunesFor(RULES_VERSION))
  const offer = lastChanceOffer(runSeed, LC_DAY, hero, (before.runes ?? []).map((q) => q.id), openRunesRules());
  const build = playerRun(hero, LC_DAY + 1, seed, { lastChance: { day: LC_DAY, boon } })[LC_DAY].build;
  const id = boon === "rune" ? offer.rune!.id : boon === "part" ? offer.part! : undefined;
  return { ...base, day: LC_DAY + 1, lives: 1, build, lastChance: { day: LC_DAY, boon, ...(id ? { id } : {}) } };
}
const check = (s: GhostSnapshot) => validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}) });
const record = (s: GhostSnapshot) => isReachable(s.day, s.wins, s.lives, { rules: s.rules, lastChance: s.lastChance?.day ?? null });

describe("RETUNE-1 HEARTS: the rules gate and the bounds", () => {
  it("heartsFor: the switch on AND rules at or after HEARTS_RULES (RULES_VERSION until BUMP-1D writes the literal)", () => {
    expect(HEARTS_RULES).toBe(RULES_VERSION);
    expect(heartsFor(RULES_VERSION)).toBe(true); // HULL-ON (the flip, HEARTS): false -> true, the switch ships on
    expect(withHearts(() => heartsFor(RULES_VERSION), false)).toBe(false); // off
    withHearts(() => {
      expect(heartsFor(RULES_VERSION)).toBe(true);
      expect(heartsFor(OLD_RULES)).toBe(false);
      expect(heartsFor("not-a-version")).toBe(false);
      expect(livesCapFor(RULES_VERSION, MAX_LIVES)).toBe(HEARTS_START);
      expect(livesCapFor(OLD_RULES, MAX_LIVES)).toBe(MAX_LIVES);
    });
    // HULL-ON (the flip, HEARTS): MAX_LIVES -> HEARTS_START, the switch ships on (withHearts put it back on); off, MAX_LIVES
    expect(livesCapFor(RULES_VERSION, MAX_LIVES)).toBe(HEARTS_START);
    expect(withHearts(() => livesCapFor(RULES_VERSION, MAX_LIVES), false)).toBe(MAX_LIVES);
  });

  it("an old-rules forgery (day 2, 0 wins, 10 lives) is refused by the decoder, the client's check and the record model; so is 11 hearts", () => {
    withHearts(() => {
      const s = { ...honest(null), day: 2, lives: 10, build: playerRun("furnace", 2, 5)[1].build };
      // under this build's rules (hearts) day 2, 0W, 10 hearts is honest (a draw, or PATCH UP after a loss)
      expect(checkSnapshot(s).lives).toBe(10);
      expect(isSnapshot(s)).toBe(true);
      expect(record(s)).toBe(true);
      const old = { ...s, rules: OLD_RULES };
      expect(() => checkSnapshot(old)).toThrow("snapshot.lives");
      expect(isSnapshot(old)).toBe(false);
      expect(isReachable(2, 0, 10, { rules: OLD_RULES })).toBe(false);
      expect(() => checkSnapshot({ ...s, lives: 11 })).toThrow("snapshot.lives");
      expect(isSnapshot({ ...s, lives: 11 })).toBe(false);
    });
    // switch off: 10 is refused under every rules version, as today (HULL-ON (the flip, HEARTS): set off here, it ships on)
    withHearts(() => {
      const s = { ...honest(null), day: 2, lives: 10, build: playerRun("furnace", 2, 5)[1].build };
      expect(() => checkSnapshot(s)).toThrow("snapshot.lives");
    }, false);
  }, 120_000);

  it("the match route's lives bound follows the request's rules", () => {
    const q = (rules: string, lives: number) => new URLSearchParams({ rules, day: "3", wins: "0", lives: String(lives), player: "p1" });
    // HULL-ON (the flip, HEARTS): the switch-off bound, set off here (it ships on)
    withHearts(() => expect(() => parseMatchQuery(q(RULES_VERSION, 10))).toThrow("lives: expected an integer in 0..9"), false);
    withHearts(() => {
      expect(parseMatchQuery(q(RULES_VERSION, 10)).lives).toBe(10);
      expect(() => parseMatchQuery(q(RULES_VERSION, 11))).toThrow("lives: expected an integer in 0..10");
      expect(() => parseMatchQuery(q(OLD_RULES, 10))).toThrow("lives: expected an integer in 0..9");
    });
  });
});

describe("RETUNE-1 HEARTS: the record model", () => {
  it("hand-checked days: start 10; 1/2/3 by day; draws free; PATCH UP +1 to 10; LAST CHANCE once at <= 1 -> 1; no refund", () => {
    withHearts(() => {
      expect(recs(1)).toBe("0W10");
      expect(recs(2)).toBe("0W9 0W10 1W10"); // a loss (9), PATCH UP on day 2's road (10), a draw (10), a win
      expect(recs(3)).toBe("0W8 0W9 0W10 1W9 1W10 2W10"); // no refund at dawn 3
      expect(recs(3, { patchUp: false, draws: false })).toBe("0W8 1W9 2W10");
      expect(recs(5, { patchUp: false, draws: false })).toBe("0W5 1W6 1W7 2W7 2W8 3W8 3W9 4W10"); // the day-4 loss costs 2
      // the first LAST CHANCE: dusk 6 of a run that lost days 1-5 (3 hearts, the loss leaves 1)
      expect(isReachable(7, 0, 1, { lastChance: 6 })).toBe(true);
      expect(isReachable(7, 0, 1, { lastChance: null })).toBe(false); // 1 heart without LAST CHANCE: never
      expect(reachableRecords(6).some((r) => r.lives <= 2)).toBe(false);
      expect(floorRecord(6)).toEqual({ wins: 0, lives: 3 });
      expect(floorRecord(7)).toEqual({ wins: 0, lives: 1 });
      expect(floorRecord(10)).toEqual({ wins: 0, lives: 1 });
      // after LAST CHANCE only PATCH UP lifts the hearts: 2 is honest, 3 is not
      expect(isReachable(8, 0, 2, { lastChance: 6 })).toBe(true);
      expect(isReachable(8, 0, 3, { lastChance: 6 })).toBe(false);
      // LAST CHANCE can't fire before day 6 (no loss leaves 1 heart or fewer there)
      for (const d of [1, 2, 3, 4, 5]) expect(reachableRecords(10, { lastChance: d })).toEqual([]);
      // every record of every day has 1..10 hearts
      for (let d = 1; d <= 10; d++) expect(reachableRecords(d).every((r) => r.lives >= 1 && r.lives <= HEARTS_START)).toBe(true);
    });
  });

  it("switch off, and old rules with it on: today's 5-life model, unchanged", () => {
    // HULL-ON (the flip, HEARTS): the test starts from the switch off itself (it ships on); the inner withHearts turns it
    // on and puts it back off, as before
    withHearts(() => {
      const today = Array.from({ length: 10 }, (_, i) => recs(i + 1));
      const todayLc = Array.from({ length: 10 }, (_, i) => recs(i + 1, { lastChance: 5 }));
      expect(recs(1)).toBe("0W5");
      withHearts(() => {
        expect(Array.from({ length: 10 }, (_, i) => recs(i + 1, { rules: OLD_RULES }))).toEqual(Array.from({ length: 10 }, (_, i) => withHearts(() => recs(i + 1, { rules: OLD_RULES }), false)));
        expect(recs(1)).toBe("0W10");
      });
      expect(Array.from({ length: 10 }, (_, i) => recs(i + 1))).toEqual(today);
      expect(Array.from({ length: 10 }, (_, i) => recs(i + 1, { lastChance: 5 }))).toEqual(todayLc);
    }, false);
  });
});

describe("RETUNE-1 HEARTS: honest hearts uploads pass; forgeries are refused", () => {
  it("honest hearts records with and without LAST CHANCE pass the deck and the record check", () => {
    withHearts(() => {
      for (const hero of ["furnace", "bastion"] as HeroId[]) {
        const plain = honest(null, hero);
        expect(check(plain), check(plain).errors.join("; ")).toEqual({ ok: true, errors: [] });
        expect(record(plain)).toBe(true);
        for (const boon of ["rune", "part", "hull"] as Boon[]) {
          const s = honest(boon, hero);
          expect(check(s), `${hero} ${boon}: ${check(s).errors.join("; ")}`).toEqual({ ok: true, errors: [] });
          expect(checkSnapshot(s).lastChance).toEqual(s.lastChance);
          expect(record(s)).toBe(true);
        }
      }
    });
  }, 600_000);

  it("refused: hearts beyond the scale's reach, a LAST CHANCE without its qualifying loss, a second one, one on the last day", () => {
    withHearts(() => {
      const plain = honest(null);
      expect(record({ ...plain, lives: 2 })).toBe(false); // day 6, 0W: 3..10 only, without LAST CHANCE
      expect(record({ ...plain, lives: 1 })).toBe(false);
      const s = honest("hull");
      expect(record({ ...s, lastChance: { day: 3, boon: "hull" } })).toBe(false); // no loss leaves <= 1 heart on day 3
      expect(record({ ...s, lastChance: { day: 5, boon: "hull" } })).toBe(false);
      expect(record({ ...s, lives: 3 })).toBe(false); // after LAST CHANCE: 1, or 2 with PATCH UP
      // a second LAST CHANCE: two LAST CHANCE runes (the deck check, as LC-1's)
      const r = honest("rune");
      const runes = r.build.runes!;
      const spare = runeList().find((d) => runeFits(d, r.hero) && !runes.some((q) => q.id === d.id))!;
      const two = { ...r, build: { ...r.build, runes: [...runes.slice(0, LC_DAY + 1), { id: spare.id }, ...runes.slice(LC_DAY + 1)] } };
      expect(check(two).errors).toEqual([`rune: runes: ${runes.length + 1} held on day ${LC_DAY + 1}, at most one a dawn and one LAST CHANCE`]);
      // on the last day: never (the decoder and validateUpload)
      expect(check({ ...s, day: 10, lastChance: { day: 10, boon: "hull" } }).errors.join()).toContain("LAST CHANCE comes only before day 10");
      expect(() => checkSnapshot({ ...s, day: 10, lastChance: { day: 10, boon: "hull" } })).toThrow("snapshot.lastChance");
    });
  }, 300_000);

  it("the seed step's checkPool and the record's own rules: a hearts pool entry passes with HEARTS on, fails with it off", () => {
    const s = { ...honest(null), lives: 6 }; // day 6, 0W: 6 hearts (losses on days 1, 2 and 4); no 5-life run holds 6
    withHearts(() => expect(checkPool([s]).length).toBe(1));
    // HULL-ON (the flip, HEARTS): the switch-off half sets it off itself (it ships on)
    withHearts(() => expect(() => checkPool([s])).toThrow("record 0W 6 lives: no run carries it into dusk 6"), false);
  }, 300_000);
});

describe("RETUNE-1 HEARTS: POST /v1/ghosts", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-rt1-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores honest hearts uploads (with and without LAST CHANCE); refuses an unreachable record (422) and 11 hearts (400)", async () => {
    setHearts(true);
    const me = await testIdentity(0);
    for (const s of [honest(null, "weaver", 7), honest("hull", "weaver", 7), honest("rune", "weaver", 7)]) {
      const res = await submitGhost(base, ownedBy(s, me), me, 5000);
      expect(res, JSON.stringify(res)).toMatchObject({ ok: true });
    }
    expect(app.store.size).toBe(3);
    const post = async (s: GhostSnapshot) => {
      const body = JSON.stringify(ownedBy(s, me));
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      return { status: r.status, body: JSON.stringify(await r.json()) };
    };
    const lc = honest("hull", "weaver", 7);
    const early = await post({ ...lc, runId: "rt1-forged", lastChance: { day: 3, boon: "hull" } });
    expect(early.status).toBe(422);
    expect(early.body).toContain("record: 0W 1 lives is no record a run carries into dusk 7 after a LAST CHANCE on day 3");
    const low = await post({ ...honest(null, "weaver", 7), runId: "rt1-low", lives: 2 });
    expect(low.status).toBe(422);
    const over = await post({ ...honest(null, "weaver", 7), runId: "rt1-over", lives: 11 });
    expect(over.status).toBe(400);
    expect(over.body).toContain("snapshot.lives");
    expect(app.store.size).toBe(3);
    // switch off: an honest hearts record (day 6, 0W, 6 hearts) is no 5-life record (422)
    setHearts(false);
    const off = await post({ ...honest(null, "weaver", 7), runId: "rt1-off", lives: 6 });
    expect(off.status).toBe(422);
    expect(app.store.size).toBe(3);
  }, 600_000);

  it("decodeSnapshot round-trips an honest 10-heart snapshot under HEARTS", () => {
    withHearts(() => {
      const s = { ...honest(null, "bastion", 9), lives: 10 };
      expect(decodeSnapshot(encodeSnapshot(s))).toEqual(checkSnapshot(s));
    });
  }, 120_000);
});
