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

const D = 5; // the LAST CHANCE day: five losses (the early-loss refund lifts day 3) leave 1 life at dusk 5
const PLATE = ITEMS.plating.supply!.hull!;
/** Z-BUMP (the flip): a rules version before LAST_CHANCE_RULES (it stays older after the bump): where the switch off
 *  refused the field or modelled no LAST CHANCE, a record under these rules is read without it, by the rules gate. */
const OLD_RULES = "bb-0.9.1";
/** The rules gate's reason for a LAST CHANCE under OLD_RULES (rulesGate.ts lastChanceGateProblem's words). */
const OLD_GATE = `rules ${OLD_RULES} predate ${LAST_CHANCE_RULES}: LAST CHANCE (snapshot.lastChance) needs ${LAST_CHANCE_RULES} or later`;

/** An honest upload at the dusk after a LAST CHANCE on day D: the par player's deck that took card `boon` at the dawn of
 *  day D + 1, its seed and lastChance; the record of a run that lost days 1-5 (0 wins, 2 lives at dusk 6). */
function honest(boon: Boon, hero: HeroId = "furnace", seed = 5): { s: GhostSnapshot; offer: LastChanceOffer } {
  const runSeed = parRunSeed(hero, seed);
  const before = playerRun(hero, D, seed)[D - 1].build;
  const offer = lastChanceOffer(runSeed, D, hero, (before.runes ?? []).map((q) => q.id));
  const build = playerRun(hero, D + 1, seed, { lastChance: { day: D, boon } })[D].build;
  const id = boon === "rune" ? offer.rune!.id : boon === "part" ? offer.part! : undefined;
  return {
    offer,
    s: {
      v: SNAPSHOT_V3, rules: RULES_VERSION, hero, day: D + 1, wins: 0, lives: 2, build, runId: `lc1-${hero}-${seed}`,
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
    const { s } = honest("hull");
    const old = { ...s, rules: OLD_RULES };
    expect(() => checkSnapshot(old)).toThrow(`snapshot.lastChance: ${OLD_GATE}`);
    expect(isSnapshot(old)).toBe(false);
    const { lastChance: _lc, ...plain } = old;
    expect(checkSnapshot(plain).lastChance).toBeUndefined(); // the same snapshot without it decodes
    expect(isSnapshot(plain)).toBe(true); // ... and the client's check takes it: only the field is refused
  });

  it("accepted under LAST_CHANCE_RULES (RULES_VERSION until the bump), refused under older rules", () => {
    const { s } = honest("hull");
    expect(LAST_CHANCE_RULES).toBe(RULES_VERSION);
    expect(checkSnapshot(s).lastChance).toEqual({ day: D, boon: "hull" });
    expect(isSnapshot(s)).toBe(true);
    // written last, after the seed; a snapshot without one encodes as before
    expect(encodeSnapshot(s).endsWith(`"seed":${s.seed},"lastChance":{"day":5,"boon":"hull"}}`)).toBe(true);
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
    // on day 10 or later, or not before the snapshot's own day
    expect(bad({ day: 10, boon: "hull" })).toThrow("snapshot.lastChance.day: 10: LAST CHANCE comes only before day 10");
    expect(bad({ day: 6, boon: "hull" })).toThrow("snapshot.lastChance.day: 6 is not before the snapshot's day 6");
    expect(bad({ day: 11, boon: "hull" })).toThrow("snapshot.lastChance.day: expected an integer in 1..10");
    expect(bad({ day: 5, boon: "gold" })).toThrow("snapshot.lastChance.boon: expected one of rune, part, hull");
    expect(bad({ day: 5, boon: "hull", id: "x" })).toThrow("snapshot.lastChance.id: a hull boon names no id");
    expect(bad({ day: 5, boon: "rune" })).toThrow("snapshot.lastChance.id: missing (a rune boon names its rune)");
    expect(bad({ day: 5, boon: "hull", extra: 1 })).toThrow("snapshot.lastChance.extra: unknown field");
    for (const lc of [[s.lastChance, s.lastChance], { day: 10, boon: "hull" }, { day: 6, boon: "hull" }, { day: 5, boon: "gold" }]) {
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
    expect(isReachable(6, 0, 2, { lastChance: 5 })).toBe(true);
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
    expect(check(two).errors).toEqual([`rune: runes: ${runes.length + 1} held on day 6, at most one a dawn and one LAST CHANCE`]);
  });

  it("a lastChance whose day can't be a loss to 1 life: its record isn't reachable", () => {
    const { s } = honest("hull");
    const early = { ...s, lastChance: { day: 3, boon: "hull" as Boon } };
    expect(check(early).ok).toBe(true); // the deck itself is honest (the HULL card is always offered) ...
    expect(lcRecord(early)).toBe(false); // ... but no run loses to 1 life at dusk 3
    expect(lcRecord({ ...s, lives: 3 })).toBe(true); // 2 back, then PATCH UP on day 6's road: 3 is honest
    expect(lcRecord({ ...s, lives: 4 })).toBe(false); // but no run carries 4 lives into dusk 6 after a LAST CHANCE on day 5
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
    expect(check(rune).errors).toEqual([`rune: runes: ${D + 2} held on day 6, at most one a dawn`]);
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
    expect(check({ ...s, lastChance: { day: 10, boon: "hull" } }).errors).toEqual(["lastChance: day 10: LAST CHANCE comes only before day 10"]);
    expect(check({ ...s, lastChance: { day: 6, boon: "hull" } }).errors).toEqual(["lastChance: day 6 is not before the deck's day 6"]);
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

  // Z-BUMP (the flip): title's end was "and the field with the switch off"
  it(`POST /v1/ghosts stores the rune, part and hull runs; refuses a forged record and the field under older rules (${OLD_RULES})`, async () => {
    const me = await testIdentity(0);
    for (const boon of ["rune", "part", "hull"] as Boon[]) {
      const { s } = honest(boon, "weaver", 7);
      const res = await submitGhost(base, ownedBy(s, me), me, 5000);
      expect(res, `${boon}: ${JSON.stringify(res)}`).toMatchObject({ ok: true });
    }
    expect(app.store.size).toBe(3);
    // a forged record: a LAST CHANCE on day 3 (no loss to 1 life there): 422 with the record line
    const { s } = honest("hull", "weaver", 7);
    const body = JSON.stringify(ownedBy({ ...s, runId: "lc1-forged", lastChance: { day: 3, boon: "hull" } }, me));
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toBe("record: 0W 2 lives is no record a run carries into dusk 6 after a LAST CHANCE on day 3");
    // Z-BUMP (the flip): was "the switch off: the field is refused by the decoder (400)"; under rules before
    // LAST_CHANCE_RULES the decoder refuses it (400, before POST's own rules check), with the rules gate's words
    const old = JSON.stringify(ownedBy({ ...s, rules: OLD_RULES, runId: "lc1-old" }, me));
    const q = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, old), body: old });
    expect(q.status).toBe(400);
    expect(JSON.stringify(await q.json())).toContain(`snapshot.lastChance: ${OLD_GATE}`);
    expect(app.store.size).toBe(3);
  }, 120_000); // AZ-BUMP (the flip): four par runs (weaver s7, each card) and their uploads, longer with the NPC day; a host
  // timeout under the 1.5-CPU quota, not the rule (timed out at vitest's 30 s default)

  it("decodeSnapshot round-trips an honest LAST CHANCE snapshot (the served form keeps it)", () => {
    const { s } = honest("part", "bastion", 9);
    expect(decodeSnapshot(encodeSnapshot(s))).toEqual(checkSnapshot(s));
  });
});
