// bb-0.8.6 (job PACKS, REQ-BFG-051 P3 and P8): the rules release and the packs' validation on both stores (JSON lines, and
// Tigris through tools/fakeS3.ts), uploads open in-process, the store seeded as a deploy seeds it (modelled on
// tests/belts.rules.test.ts):
//  - the gate: RULES_VERSION is bb-0.8.7 since RUNES-1 (bb-0.8.6 before; the label is 0.9.14); /v1/health names it;
//    an honest deck under bb-0.8.3 (the rules 0.8.5 ships) is refused (422) and nothing is stored under it; every near
//    miss of bb-0.8.6 (and since RUNES-1 bb-0.8.6 itself) is refused (422 at the exact rules check, 400 where the
//    decoder's pattern refuses it);
//  - the packs (P3): an honest run that buys packs on every visit uploads on every day (the par player under the value,
//    ARMOR-greedy and BELT-greedy policies: 201 for each day's dusk deck); one ARMOR PACK more than the day's gold allows
//    is refused with the budget message; a hull or a belt that no road mix plus whole packs can make stays refused.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEROES, ITEMS, RULES_VERSION, START_LIVES, type HeroId } from "../src/sim/content";
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): records on each rules' scale
import { heartsFor, longRunFor } from "../src/net/rulesGate"; // HULL-ON (the flip, HEARTS): which scale a record's rules read; BUMP-1D: and whether they are a long run's
import { VERSION } from "../src/version";
import type { Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { buildCost, maxGoldByDay, validateUpload } from "../src/net/validate";
import { ghostId, SNAPSHOT_V3, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { withDawnRunes } from "./runeFill"; // FLIP-X2: an upload holds its day's runes
import { playerRun } from "../src/sim/harness/player";
import { PACK_POLICY, type PackPolicy } from "../src/sim/harness/belts";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import { seedStore } from "../server/seed";
import { storeBackends } from "./netStores";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

const OLD_RULES = "bb-0.8.3"; // 0.8.5's rules (BELTS)
const T0 = 1_790_000_000_000;
const HEROES4: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
/** bb-0.8.6's near misses: the rules it replaces first, then its neighbours and garbled forms. RUNES-1 (bb-0.8.7, the
 *  server's rules now): bb-0.8.6 itself in bb-0.8.7's place. */
const NEAR = [OLD_RULES, "bb-0.8.5", "bb-0.8.6", "bb-0.8.6x", "BB-0.8.6", " bb-0.8.6", "bb-0.8.6 ", "bb-0.8.06", "bb-0.8.60", "bb-0.8.6.0", "bb-0.8", "bb_0.8.6"];
const PATTERN_OK = (r: string) => /^[A-Za-z0-9._-]{1,32}$/.test(r); // src/net/snapshot.ts RULES_PATTERN
const refused = (rules: string) => `rules ${rules} not accepted: this server validates bb-0.13.0`; // BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the server names bb-0.13.0 (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the server names bb-0.11.0 (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7)

/** A dusk snapshot on a record a run carries into it: every fight won, all its lives (5, or HEARTS_START hearts). */
function dusk(hero: HeroId, day: number, build: Build, rules = RULES_VERSION, runId = `packs-${hero}-${day}`): GhostSnapshot {
  // HULL-ON (the flip, HEARTS; tests/belts.rules.test.ts's dusk() pattern): every fight won is all HEARTS_START (10) hearts
  // under this build's rules (heartsFor: the hearts record model, where 0W 5 lives is no record a run carries into dusk 1:
  // 422 "record: 0W 5 lives ..."); older and garbled rules keep their 5 lives (their 5-lives model). Was lives: 5 on every
  // rules
  const lives = heartsFor(rules) ? HEARTS_START : START_LIVES;
  // BUMP-1D (LONG_RUN ships on): under a long run's rules (this build's: bb-0.11.0) the upload states the dusks the run lost
  // (server/app.ts lossesProblem: 422 "losses: ..." without it): every fight won is none. Older and garbled rules take no such
  // field (the decoder refuses it, 400, ahead of the rules check these tests read), so only the rules that have the long run
  return { v: SNAPSHOT_VERSION, rules, hero, day, wins: day - 1, lives, ...(longRunFor(rules) ? { losses: 0 } : {}), build, runId, playerId: `p-${hero}`, createdAt: T0 };
}

/** FLIP-X2 (validateUpload's player mode wants exactly `day` runes; runes travel only in v3): dusk() as an upload under
 *  this build's rules travels, its rune-less `build` holding its day's runes, neutral ones (tests/runeFill.ts: no hull,
 *  belt or gold, so every budget and supply check means what it meant), in a v3 snapshot with no seed. Was
 *  dusk(hero, day, build): v2 and rune-less, which the exact rune count now refuses. */
function upDusk(hero: HeroId, day: number, build: Build, runId?: string): GhostSnapshot {
  return { ...dusk(hero, day, withDawnRunes(build, day), RULES_VERSION, runId), v: SNAPSHOT_V3 };
}

/** Run `fn` with hero `h`'s pack policy set to `p`, then put "value" back. */
function withPacks<T>(h: HeroId, p: PackPolicy, fn: () => T): T {
  const table = PACK_POLICY as Record<HeroId, PackPolicy>, saved = table[h];
  table[h] = p;
  try { return fn(); } finally { table[h] = saved; }
}

/** The hero's day-1 deck with `armors` ARMOR PACKs (and `belts` BELT PACKs) added. */
function packed(hero: HeroId, armors: number, belts = 0): Build {
  const b = heroStartBuild(hero, 1);
  b.hullBonus += ITEMS.plating.supply!.hull! * armors; // NUM-1: an ARMOR PACK is +250 hull (x10, was 25)
  b.beltCap += 4 * belts;
  return b;
}

describe("rules bb-0.8.7: the version", () => {
  it("RULES_VERSION is bb-0.8.7 (RUNES-1; PACKS's bb-0.8.6 before); the label is 0.9.14 since the Prime staged it (the 0.9.14 label commit; 0.9.13 before)", () => {
    expect(RULES_VERSION).toBe("bb-0.13.0") /* BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the bump (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7) */;
    expect(VERSION).toBe("0.9.14");
  });
});

describe.each(storeBackends())("rules bb-0.8.7 and the packs on the $name store (uploads open in-process)", (backend) => {
  let app: GhostServer, base: string, me: Identity;
  let k = 0;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 10_000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    me = await testIdentity(1);
    await seedStore(app.store);
  }, 600_000);
  // HULL-ON (the flip, PICK; cap's ruling 9c114aab5ba18dfe, tests/belts.rules.test.ts's same hook): 120 s -> 600 s.
  // seedStore's default pool, generateSamplePool(), grades every seed ghost with PICK on (samplePool.ts gradeSamplePool);
  // the first store's hook pays that one grading (the second store's hits the per-process memo). belts.rules' identical
  // hook measured the whole file 230 s alone unpinned (HULL-ON run 2), so 600 s is over 2x; here the jsonl hook timed out
  // at 120 s in HULL-ON run 4's suite (pinned: the file 185 s)
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });
  /** POST the snapshot as `me` (ownedBy: this device's id and its player name), as raw JSON. */
  const post = async (s: GhostSnapshot) => {
    const body = JSON.stringify(ownedBy(s, me));
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    return { status: r.status, body: (await r.json()) as { id?: string; error?: string; errors?: string[] } };
  };
  const fresh = (s: GhostSnapshot): GhostSnapshot => ({ ...s, runId: `${s.runId}-${k++}` });

  it("/v1/health names bb-0.8.7; an honest deck under bb-0.8.3 (0.8.5's rules) and every near miss of bb-0.8.6 (bb-0.8.6 itself too) is refused, and nothing is stored", async () => {
    expect(((await (await fetch(`${base}/v1/health`)).json()) as { rules: string }).rules).toBe("bb-0.13.0") /* BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the bump (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7) */;
    const before = backend.storedRecords();
    const seen: Record<string, number> = {};
    for (const rules of NEAR) {
      const r = await post(fresh(dusk("furnace", 1, heroStartBuild("furnace"), rules)));
      seen[JSON.stringify(rules)] = r.status;
      if (PATTERN_OK(rules)) expect(r.body.error, JSON.stringify(rules)).toBe(refused(rules));
      else expect(r.body.error, JSON.stringify(rules)).toMatch(/^snapshot\.rules: /);
    }
    expect(seen).toEqual(Object.fromEntries(NEAR.map((r) => [JSON.stringify(r), PATTERN_OK(r) ? 422 : 400])));
    // the same honest decks of the four heroes under bb-0.8.3: refused; under bb-0.8.7: stored
    for (const hero of HEROES4) {
      const old = await post(fresh(dusk(hero, 3, heroStartBuild(hero), OLD_RULES)));
      expect([old.status, old.body.error], hero).toEqual([422, refused(OLD_RULES)]);
    }
    expect(backend.storedRecords()).toBe(before);
    for (const day of [1, 3, 10]) expect(await app.store.bucket(OLD_RULES, day, "all"), `day ${day}`).toEqual([]);
    for (const hero of HEROES4) {
      const s = fresh(upDusk(hero, 3, heroStartBuild(hero))); // FLIP-X2: upDusk, its day's runes in v3 (was dusk(hero, 3, heroStartBuild(hero)))
      const r = await post(s);
      expect([r.status, r.body.id], hero).toEqual([201, ghostId(ownedBy(s, me))]);
    }
  });

  it("P3: an honest run that buys packs on every visit uploads on every day (value, ARMOR-greedy, BELT-greedy; 201)", async () => {
    let n = 0, packs = 0;
    for (const hero of HEROES4) for (const p of ["value", "armor", "belt"] as PackPolicy[]) {
      const days = withPacks(hero, p, () => playerRun(hero, 10, 1, { onDecide: () => {} }));
      for (const d of days) {
        packs += d.buys.filter((b) => b.def === "beltcrate" || b.def === "plating").length;
        // FLIP-X2: the run's deck holds the runes it took at each dawn, and runes travel only in v3 (was v: SNAPSHOT_VERSION)
        const r = await post(fresh({ ...dusk(hero, d.day, d.build, RULES_VERSION, `packs-run-${hero}-${p}-${d.day}`), v: SNAPSHOT_V3 }));
        expect(r.status, `${hero} ${p} day ${d.day}: ${JSON.stringify(r.body)}`).toBe(201);
        n++;
      }
    }
    expect(n).toBe(4 * 3 * 10);
    expect(packs).toBeGreaterThan(4 * 3 * 5); // more than five packs a run on average
  }, 120_000);

  it("P3: one ARMOR PACK more than the day's gold allows is refused with the budget message; a hull or a belt no road mix and whole packs make is refused", async () => {
    const before = backend.storedRecords();
    for (const hero of ["furnace", "bastion"] as HeroId[]) for (const day of [1, 6]) {
      let n = 0;
      // FLIP-X2: each deck holds its day's runes (withDawnRunes, upDusk; was packed(hero, k) and dusk(...) rune-less), so the
      // budget is what refuses the pack too many, not the rune count
      while (validateUpload(withDawnRunes(packed(hero, n + 1), day), day).ok) n++;
      expect(n, `${hero} d${day}`).toBeGreaterThanOrEqual(Math.floor((maxGoldByDay(day) - buildCost(packed(hero, 0)).total) / 5));
      const ok = await post(fresh(upDusk(hero, day, packed(hero, n))));
      expect(ok.status, `${hero} d${day} ${n} packs`).toBe(201);
      const over = await post(fresh(upDusk(hero, day, packed(hero, n + 1))));
      expect([over.status, over.body.error], `${hero} d${day} ${n + 1} packs`).toEqual([422, "deck failed validation"]);
      expect(over.body.errors?.join(" | "), `${hero} d${day}`).toMatch(/^budget: build costs \d+ gold \(.*\) but a player's day \d+ allows at most \d+/);
    }
    const hull = packed("weaver", 0);
    hull.hullBonus = 1;
    // FLIP-X2: with its day's runes (upDusk; was dusk(...) rune-less), so the supply check alone refuses these two
    const h = await post(fresh(upDusk("weaver", 10, hull)));
    expect([h.status, h.body.error]).toEqual([422, "deck failed validation"]);
    expect(h.body.errors?.join(" | ")).toMatch(/supply: hullBonus 1 is not a hull a player can reach by day 10/);
    const belt = packed("foundry", 0);
    belt.beltCap = HEROES.foundry.belt + 2;
    const b = await post(fresh(upDusk("foundry", 10, belt)));
    expect([b.status, b.body.error]).toEqual([422, "deck failed validation"]);
    expect(b.body.errors?.join(" | ")).toMatch(/supply: beltCap \d+ is not \d+ \+ whole \+4 belt crates/);
    expect(backend.storedRecords()).toBe(before + 4);
  });
});
