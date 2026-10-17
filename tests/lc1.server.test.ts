// LC-1 (REQ-BFG-073): the server's upload check of a LAST CHANCE (src/net/snapshot.ts lastChanceField and rulesGate.ts
// lastChanceGateProblem; src/net/validate.ts lastChanceProblem, runeProblem's place, the +LAST_CHANCE_HULL grant and the free part;
// src/net/records.ts isReachable's LAST CHANCE; server/app.ts). Honest runs are the par player's own runs with each card
// (player.ts playerRun's opts.lastChance), on the par run's seed; every forgery is refused with its own error line. Z-BUMP
// (the flip): LAST CHANCE is the game's rule, its switch deleted; a record under rules before LAST_CHANCE_RULES (OLD_RULES,
// bb-0.9.1) is read by the rules gate, without it. The server's data dir is under os.tmpdir() (run with TMPDIR set).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { LAST_CHANCE_HULL, lastChanceOffer, lastChanceParts, type Boon, type LastChanceOffer } from "../src/sim/lastChance";
import { RUNES, runeFits, runeList } from "../src/sim/runes";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { checkSnapshot, decodeSnapshot, encodeSnapshot, SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { LAST_CHANCE_RULES, lastChanceGateProblem } from "../src/net/rulesGate";
import { validateUpload } from "../src/net/validate";
import { isReachable, reachableRecords } from "../src/net/records";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { submitGhost } from "../src/net/ghostClient";
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import type { Build } from "../src/sim/deck";
import { withHearts } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): the 5-life model's off check
import { setLongRun, withLongRun } from "../src/sim/longRun"; // BUMP-1D: LONG_RUN ships on; the 10-day halves run it off
import { openRunesRules, withOpenRunes } from "../src/sim/openRunes"; // HULL-ON (the flip, OPEN_RUNES): the offer rule

// the LAST CHANCE day. HULL-ON (the flip, HEARTS): 5 -> 6, the record model of this build's rules is the hearts one
// (heartsFor): a run that loses every dusk holds 9 8 7 5 3 hearts after days 1-5, and the loss of day 6 (it would leave 1
// or fewer) fires LAST CHANCE, which sets 1 heart; on 5 lives five losses (the early-loss refund lifted day 3) left 1 life
// at dusk 5
const D = 6;
const PLATE = ITEMS.plating.supply!.hull!;
/** Z-BUMP (the flip): a rules version before LAST_CHANCE_RULES (it stays older after the bump): where the switch off
 *  refused the field or modelled no LAST CHANCE, a record under these rules is read without it, by the rules gate. */
const OLD_RULES = "bb-0.9.1";
/** The rules gate's reason for a LAST CHANCE under OLD_RULES (rulesGate.ts lastChanceGateProblem's words). */
const OLD_GATE = `rules ${OLD_RULES} predate ${LAST_CHANCE_RULES}: LAST CHANCE (snapshot.lastChance) needs ${LAST_CHANCE_RULES} or later`;

/** An honest upload at the dusk after a LAST CHANCE on day D: the par player's deck that took card `boon` at the dawn of
 *  day D + 1, its seed and lastChance; the record of a run that lost days 1-6 (0 wins, 1 heart at dusk 7). HULL-ON (the
 *  flip, HEARTS): was days 1-5 (0 wins, 2 lives at dusk 6). */
function honest(boon: Boon, hero: HeroId = "furnace", seed = 5): { s: GhostSnapshot; offer: LastChanceOffer } {
  const runSeed = parRunSeed(hero, seed);
  const before = playerRun(hero, D, seed)[D - 1].build;
  // HULL-ON (the flip, OPEN_RUNES): the par player takes the card on the switch's offer rule (open: no runeFits filter), the
  // rule the server re-derives for this build's rules (openRunesFor(RULES_VERSION))
  const offer = lastChanceOffer(runSeed, D, hero, (before.runes ?? []).map((q) => q.id), openRunesRules());
  const build = playerRun(hero, D + 1, seed, { lastChance: { day: D, boon } })[D].build;
  const id = boon === "rune" ? offer.rune!.id : boon === "part" ? offer.part! : undefined;
  return {
    offer,
    s: {
      // HULL-ON (the flip, HEARTS): lives 2 -> 1 (LAST CHANCE sets 1 heart)
      v: SNAPSHOT_V3, rules: RULES_VERSION, hero, day: D + 1, wins: 0, lives: 1, build, runId: `lc1-${hero}-${seed}`,
      playerId: "p-lc1", createdAt: 1_790_000_000_000, seed: runSeed, lastChance: { day: D, boon, ...(id ? { id } : {}) },
    },
  };
}

const check = (s: GhostSnapshot) => validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}) });
const lcRecord = (s: GhostSnapshot) => isReachable(s.day, s.wins, s.lives, { lastChance: s.lastChance?.day ?? null });

/** `b` with whole plates added up to the most the check takes (the deck at its budget's edge). */
function fillPlates(s: GhostSnapshot): GhostSnapshot {
  let k = 0;
  const at = (n: number): GhostSnapshot => ({ ...s, build: { ...s.build, hullBonus: s.build.hullBonus + n * PLATE } as Build });
  while (k < 60 && check(at(k + 1)).ok) k++;
  return at(k);
}

describe("LC-1: the decoder (snapshot.lastChance)", () => {
  // Z-BUMP (the flip): was "refuses the field with the switch off (rules bb-0.9.3)"; the switch is gone, so the field is
  // refused under rules before LAST_CHANCE_RULES, with the rules gate's words
  it(`refuses the field under rules before LAST_CHANCE_RULES (${OLD_RULES}), with the rules gate's words, as V3_LIVE's off fields`, () => {
    // HULL-ON (the flip, OPEN_RUNES): stamped OLD_RULES, the deck's dawn runes are re-derived on those rules' closed offers
    // (openRunesFor(OLD_RULES) is false), so the deck is the par player's with OPEN_RUNES off, as such a record holds it
    const { s } = withOpenRunes(() => honest("hull"), false);
    const old = { ...s, rules: OLD_RULES };
    expect(() => checkSnapshot(old)).toThrow(`snapshot.lastChance: ${OLD_GATE}`);
    expect(isSnapshot(old)).toBe(false);
    const { lastChance: _lc, ...plain } = old;
    expect(checkSnapshot(plain).lastChance).toBeUndefined(); // the same snapshot without it decodes
    expect(isSnapshot(plain)).toBe(true); // ... and the client's check takes it: only the field is refused
  });

  // AZ-BUMP (the bump to bb-0.10.0): LAST_CHANCE_RULES stays Z-BUMP's literal bb-0.9.7 and this build's rules move past it
  // (was "accepted under LAST_CHANCE_RULES (RULES_VERSION until the bump), ...", LAST_CHANCE_RULES === RULES_VERSION)
  it("accepted under LAST_CHANCE_RULES (bb-0.9.7, a literal since Z-BUMP) and this build's later rules, refused under older rules", () => {
    const { s } = honest("hull");
    expect(LAST_CHANCE_RULES).toBe("bb-0.9.7"); // AZ-BUMP: the bump (was RULES_VERSION's value until it)
    expect([RULES_VERSION, lastChanceGateProblem(RULES_VERSION)]).toEqual(["bb-0.11.0", null]); // AZ-BUMP: this build's rules have LAST CHANCE; BUMP-1D: bb-0.11.0 (was bb-0.10.0)
    expect(checkSnapshot(s).lastChance).toEqual({ day: D, boon: "hull" });
    expect(isSnapshot(s)).toBe(true);
    // written last, after the seed; a snapshot without one encodes as before
    expect(encodeSnapshot(s).endsWith(`"seed":${s.seed},"lastChance":{"day":6,"boon":"hull"}}`)).toBe(true); // HULL-ON (the flip, HEARTS): day 5 -> 6
    expect(lastChanceGateProblem("bb-0.9.1")).toMatch(/^rules bb-0\.9\.1 predate bb-0\.9\.7: LAST CHANCE \(snapshot\.lastChance\) needs bb-0\.9\.7 or later$/); // Z-BUMP: the bump (LAST_CHANCE_RULES was RULES_VERSION, bb-0.9.3)
    expect(lastChanceGateProblem("bb-0.9.3")).toMatch(/^rules bb-0\.9\.3 predate bb-0\.9\.7: LAST CHANCE \(snapshot\.lastChance\) needs bb-0\.9\.7 or later$/); // Z-BUMP: release Y's rules predate LAST CHANCE
    expect(lastChanceGateProblem("nope")).toMatch(/is not a bb-MAJOR\.MINOR\.PATCH version/);
    expect(() => checkSnapshot({ ...s, rules: "bb-0.9.1" })).toThrow(/snapshot\.(rules|lastChance)/);
    expect(() => checkSnapshot({ ...s, v: 2 })).toThrow(/not allowed in a v2 snapshot/);
  });

  it("refuses a malformed one, each with its own line", () => {
    const { s } = honest("rune");
    const bad = (lc: unknown) => () => checkSnapshot({ ...s, lastChance: lc } as unknown as GhostSnapshot);
    // a second LAST CHANCE: a run has one
    expect(bad([s.lastChance, s.lastChance])).toThrow("snapshot.lastChance: a run has one LAST CHANCE, not a list of 2");
    // on day 10 or later, or not before the snapshot's own day (HULL-ON (the flip, HEARTS): the snapshot's day 6 -> 7)
    // BUMP-1D: the day-10 and 1..10 lines are the 10-day run's (LONG_RUN ships on, and this build's rules are a long run's, which has no
    // last day: its card may come on any day 1..25 before the snapshot's own), so they are asked of the 10-day world (the switch off)
    withLongRun(() => {
      expect(bad({ day: 10, boon: "hull" })).toThrow("snapshot.lastChance.day: 10: LAST CHANCE comes only before day 10");
      expect(bad({ day: 7, boon: "hull" })).toThrow("snapshot.lastChance.day: 7 is not before the snapshot's day 7");
      expect(bad({ day: 11, boon: "hull" })).toThrow("snapshot.lastChance.day: expected an integer in 1..10");
    }, false);
    expect(bad({ day: 10, boon: "hull" })).toThrow("snapshot.lastChance.day: 10 is not before the snapshot's day 7");
    expect(bad({ day: 7, boon: "hull" })).toThrow("snapshot.lastChance.day: 7 is not before the snapshot's day 7");
    expect(bad({ day: 11, boon: "hull" })).toThrow("snapshot.lastChance.day: 11 is not before the snapshot's day 7");
    expect(bad({ day: 26, boon: "hull" })).toThrow("snapshot.lastChance.day: expected an integer in 1..25");
    expect(bad({ day: 5, boon: "gold" })).toThrow("snapshot.lastChance.boon: expected one of rune, part, hull");
    expect(bad({ day: 5, boon: "hull", id: "x" })).toThrow("snapshot.lastChance.id: a hull boon names no id");
    expect(bad({ day: 5, boon: "rune" })).toThrow("snapshot.lastChance.id: missing (a rune boon names its rune)");
    expect(bad({ day: 5, boon: "hull", extra: 1 })).toThrow("snapshot.lastChance.extra: unknown field");
    for (const lc of [[s.lastChance, s.lastChance], { day: 10, boon: "hull" }, { day: 7, boon: "hull" }, { day: 5, boon: "gold" }]) { // HULL-ON (HEARTS): day 6 -> 7
      expect(isSnapshot({ ...s, lastChance: lc })).toBe(false); // the client's check agrees
    }
  });
});

describe("LC-1: honest LAST CHANCE runs pass the upload check", () => {
  it(`each card: the rune at its place, the free part's price once, the +${LAST_CHANCE_HULL} as a grant; the record knows the life`, () => {
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) {
      for (const boon of ["rune", "part", "hull"] as Boon[]) {
        const { s } = honest(boon, hero);
        expect(check(s), `${hero} ${boon}: ${check(s).errors.join("; ")}`).toEqual({ ok: true, errors: [] });
        expect(checkSnapshot(s).lastChance).toEqual(s.lastChance);
        expect(lcRecord(s)).toBe(true);
      }
    }
    // the reachable records know the extra life: 0 wins and 2 lives at dusk 6 after a LAST CHANCE on day 5; a run that
    // never had one can't carry 1 life into a dusk (the loss that left it would have fired it), one that had it can
    // HULL-ON (the flip, HEARTS): the record of this build's rules is the hearts one: 0 wins and 1 heart at dusk 7 after a
    // LAST CHANCE on day 6 (was 0W 2 lives at dusk 6 after one on day 5, the 5-life model's, kept off below)
    expect(isReachable(7, 0, 1, { lastChance: 6 })).toBe(true);
    expect(withHearts(() => isReachable(6, 0, 2, { lastChance: 5 }), false)).toBe(true);
    expect(isReachable(6, 0, 1, { lastChance: null })).toBe(false);
    expect(isReachable(8, 2, 1, { lastChance: null })).toBe(false);
    expect(isReachable(8, 1, 1, { lastChance: 6 })).toBe(true);
    expect(reachableRecords(6).some((r) => r.lives === 1)).toBe(false); // LAST CHANCE: no 1-life record at dusk 6
    // Z-BUMP (the flip): was "switch off: the records are today's"; a record under rules before LAST_CHANCE_RULES is read
    // without LAST CHANCE (0W 1 life at dusk 6 is reachable, 0W 2 lives too), and its lastChance changes nothing
    const old = { rules: OLD_RULES };
    expect([isReachable(6, 0, 1, old), isReachable(6, 0, 2, old)]).toEqual([true, true]);
    expect(reachableRecords(6, { ...old, lastChance: 5 })).toEqual(reachableRecords(6, old));
    // AZ-BUMP (the flip): 600 s, 30 s hit in run 5's group check under the 1.5-CPU quota (the GATE RULE; the twelve honest
    // LAST CHANCE runs fight a warlord every day), not the rule
  }, 600_000);

  it(`the +${LAST_CHANCE_HULL} counts once toward the reachable hull; the free part's price comes out of the budget once`, () => {
    // at its budget's edge (plates added while the check takes them), each honest deck still passes ...
    const hull = fillPlates(honest("hull").s), part = fillPlates(honest("part").s);
    expect(check(hull).ok).toBe(true);
    expect(check(part).ok).toBe(true);
    // ... and the same deck without its lastChance is over: the hull would be bought, the part paid for
    const { lastChance: _h, ...hullNoLc } = hull;
    const { lastChance: _p, ...partNoLc } = part;
    expect(check(hullNoLc).errors.join()).toMatch(/^(budget|supply): /);
    expect(check(partNoLc).errors.join()).toMatch(/^budget: /);
  });
});

describe("LC-1: forgeries are refused, each with its own error line", () => {
  it("a second LAST CHANCE (two LAST CHANCE runes)", () => {
    const { s } = honest("rune");
    const runes = s.build.runes!;
    const spare = runeList().find((d) => runeFits(d, s.hero) && !runes.some((q) => q.id === d.id))!;
    const two = { ...s, build: { ...s.build, runes: [...runes.slice(0, D + 1), { id: spare.id }, ...runes.slice(D + 1)] } };
    expect(check(two).errors).toEqual([`rune: runes: ${runes.length + 1} held on day ${D + 1}, at most one a dawn and one LAST CHANCE`]); // HULL-ON (HEARTS): day 6 -> 7
  });

  it("a lastChance whose day can't be a loss to 1 life: its record isn't reachable", () => {
    const { s } = honest("hull");
    const early = { ...s, lastChance: { day: 3, boon: "hull" as Boon } };
    expect(check(early).ok).toBe(true); // the deck itself is honest (the HULL card is always offered) ...
    expect(lcRecord(early)).toBe(false); // ... but no run loses to 1 life at dusk 3
    // HULL-ON (the flip, HEARTS): 3 -> 2 honest and 4 -> 3 refused: LAST CHANCE sets 1 heart (none back), then PATCH UP
    expect(lcRecord({ ...s, lives: 2 })).toBe(true); // 1 heart, then PATCH UP on day 7's road: 2 is honest
    expect(lcRecord({ ...s, lives: 3 })).toBe(false); // but no run carries 3 hearts into dusk 7 after a LAST CHANCE on day 6
  });

  it("a boon that isn't in the offer the seed gives", () => {
    const { s, offer } = honest("rune");
    const other = runeList().find((d) => d.tier === "epic" && runeFits(d, s.hero) && d.id !== offer.rune!.id && !s.build.runes!.some((q) => q.id === d.id))!;
    const runes = s.build.runes!.map((q, i) => (i === D ? { id: other.id } : q));
    const swapped = { ...s, build: { ...s.build, runes }, lastChance: { day: D, boon: "rune" as Boon, id: other.id } };
    expect(check(swapped).errors).toEqual([`lastChance: rune ${other.id} was not in the LAST CHANCE offer of day ${D} (it offered ${offer.rune!.id})`]);
    const p = honest("part");
    const wrong = lastChanceParts().find((d) => d.id !== p.offer.part)!.id; // Z-PREP: another part of the 7 the card draws from
    expect(check({ ...p.s, lastChance: { day: D, boon: "part", id: wrong } }).errors).toEqual([`lastChance: part ${wrong} was not in the LAST CHANCE offer of day ${D} (it offered ${p.offer.part})`]);
    // a hero's factory, and since Z-PREP every epic factory and core (STAMP PRESS, SALVO RACK), is no LAST CHANCE part
    for (const id of ["kiln", "press", "salvo"]) {
      expect(ITEMS[id].kind).toMatch(/^(factory|core)$/);
      expect(check({ ...p.s, lastChance: { day: D, boon: "part", id } }).errors).toEqual([`lastChance: ${id} is no LAST CHANCE part (an epic rig, turret or gear of the shop's catalogue)`]);
    }
  });

  it("a rune claimed free without a lastChance; a part claimed free without one", () => {
    const { lastChance: _r, ...rune } = honest("rune").s;
    expect(check(rune).errors).toEqual([`rune: runes: ${D + 2} held on day ${D + 1}, at most one a dawn`]); // HULL-ON (HEARTS): day 6 -> 7
    const { lastChance: _p, ...part } = fillPlates(honest("part").s);
    expect(check(part).errors.join()).toMatch(/^budget: build costs \d+ gold/);
  });

  it(`+${LAST_CHANCE_HULL} claimed twice`, () => {
    const s = fillPlates(honest("hull").s);
    const twice = { ...s, build: { ...s.build, hullBonus: s.build.hullBonus + LAST_CHANCE_HULL } };
    expect(check(twice).errors.join()).toMatch(/^(budget|supply): /);
  });

  it("a LAST CHANCE on day 10 or not before the deck's day, through validateUpload too (a caller without the decoder)", () => {
    const { s } = honest("hull");
    // BUMP-1D: the day-10 line is the 10-day run's (the switch off: validateUpload judges the deck in the record's own world); this build's
    // rules are a long run's, whose card has no last day, so day 10 for a day-7 deck is refused as any day not before the deck's own
    withLongRun(() => expect(check({ ...s, lastChance: { day: 10, boon: "hull" } }).errors).toEqual(["lastChance: day 10: LAST CHANCE comes only before day 10"]), false);
    expect(check({ ...s, lastChance: { day: 10, boon: "hull" } }).errors).toEqual(["lastChance: day 10 is not before the deck's day 7"]);
    expect(check({ ...s, lastChance: { day: 7, boon: "hull" } }).errors).toEqual(["lastChance: day 7 is not before the deck's day 7"]); // HULL-ON (HEARTS): 6 -> 7
    // Z-BUMP (the flip): was "switch off: not in this rules version yet"; under rules before LAST_CHANCE_RULES validateUpload
    // refuses the field with the rules gate's words
    expect(check({ ...s, rules: OLD_RULES }).errors).toEqual([`lastChance: ${OLD_GATE}`]);
  });
});

describe("LC-1: an honest LAST CHANCE run uploads through the server, each card", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-lc1-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** The honest uploads of each card, a forged record and the field under older rules, in one of two worlds. BUMP-1D: this build's rules are
   *  a long run's (LONG_RUN ships on), whose upload states its `losses` (every dusk of these runs was lost: D = 6) and whose record line
   *  names them; the 10-day world (LONG_RUN off) needs none and names none, as this test was at bb-0.10.0. Each world uploads its own seed. */
  async function lcPosts(long: boolean, seed: number): Promise<void> {
    setLongRun(long);
    try {
      const me = await testIdentity(0);
      const up = (x: GhostSnapshot): GhostSnapshot => (long ? { ...x, losses: D } : x);
      const had = app.store.size;
      for (const boon of ["rune", "part", "hull"] as Boon[]) {
        const { s } = honest(boon, "weaver", seed);
        const res = await submitGhost(base, ownedBy(up(s), me), me, 5000);
        expect(res, `${boon}: ${JSON.stringify(res)}`).toMatchObject({ ok: true });
      }
      expect(app.store.size).toBe(had + 3);
      // a forged record: a LAST CHANCE on day 3 (no loss to 1 life there): 422 with the record line
      const { s } = honest("hull", "weaver", seed);
      const body = JSON.stringify(ownedBy(up({ ...s, runId: "lc1-forged", lastChance: { day: 3, boon: "hull" } }), me));
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      expect(r.status).toBe(422);
      // HULL-ON (the flip, HEARTS): 0W 2 lives at dusk 6 -> 0W 1 (hearts) at dusk 7; BUMP-1D: and the long run's line names its 6 losses
      expect(((await r.json()) as { error: string }).error).toBe(`record: 0W 1 lives${long ? ` and ${D} losses` : ""} is no record a run carries into dusk 7 after a LAST CHANCE on day 3`);
      // Z-BUMP (the flip): was "the switch off: the field is refused by the decoder (400)"; under rules before
      // LAST_CHANCE_RULES the decoder refuses it (400, before POST's own rules check), with the rules gate's words (and no `losses`:
      // the 10-day rules before the long run's keep that field reserved)
      const old = JSON.stringify(ownedBy({ ...s, rules: OLD_RULES, runId: "lc1-old" }, me));
      const q = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, old), body: old });
      expect(q.status).toBe(400);
      expect(JSON.stringify(await q.json())).toContain(`snapshot.lastChance: ${OLD_GATE}`);
      expect(app.store.size).toBe(had + 3);
    } finally {
      setLongRun(true);
    }
  }

  // Z-BUMP (the flip): title's end was "and the field with the switch off"
  it(`POST /v1/ghosts stores the rune, part and hull runs; refuses a forged record and the field under older rules (${OLD_RULES})`, async () => {
    // BUMP-1D: the long run (this build's rules): each upload states its `losses`; without them it is refused (422, the reason names the field)
    await lcPosts(true, 7);
    const me = await testIdentity(0);
    const { s } = honest("hull", "weaver", 7);
    const bare = JSON.stringify(ownedBy({ ...s, runId: "lc1-bare" }, me));
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, bare), body: bare });
    expect([r.status, ((await r.json()) as { error: string }).error]).toEqual([422, expect.stringMatching(/^losses: .*snapshot\.losses/)]);
  }, 120_000); // AZ-BUMP (the flip): four par runs (weaver s7, each card) and their uploads, longer with the NPC day; a host
  // timeout under the 1.5-CPU quota, not the rule (timed out at vitest's 30 s default)

  it(`the 10-day run (LONG_RUN off): the same POSTs need no \`losses\` and are stored as before; the field under older rules (${OLD_RULES}) is refused`, async () => {
    // BUMP-1D: the test as it was at bb-0.10.0, run in the 10-day world explicitly; its own seed (three more records stored)
    await lcPosts(false, 8);
  }, 120_000);

  it("decodeSnapshot round-trips an honest LAST CHANCE snapshot (the served form keeps it)", () => {
    const { s } = honest("part", "bastion", 9);
    expect(decodeSnapshot(encodeSnapshot(s))).toEqual(checkSnapshot(s));
  });
});
