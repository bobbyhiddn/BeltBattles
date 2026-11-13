// BUMP-1I (REQ-BFG-125, VETERAN; battle rules bb-0.16.0), P1: the veteran's pick (src/net/veteran.ts), the server's reading of `streak`
// (server/app.ts parseMatchQuery and the match route), the request URL (src/net/ghostClient.ts matchUrl) and the offline fallback
// (veteranFallback). The switch is ON unless a test says off (withVeteran(fn, false), synchronously only).
//  - a bb-0.15.0 request with any streak picks exactly as matchPick does (REQ-BFG-125 line 3);
//  - a bb-0.16.0 request with streak 0 or 1 picks exactly as matchPick does; with the shield on it never draws a tier ghost while another
//    ghost is eligible, and draws one when nothing else is;
//  - a bb-0.16.0 request with streak 2 and a record `at` or more wins ahead draws only from the strongest share by grade; one not `at` ahead picks as matchPick;
//  - D1, the new-player pool (D2) and an endless request are as today for a veteran too; the switch off picks as today at every rules label;
//  - the server answers 400 to streak=x and streak=100 and reads an absent streak as 0; a request URL with no streak is today's byte for byte.
// The committed seed pool is stamped bb-0.16.0 since P4's R3 (254 ghosts: 192 + the 48 tier ghosts + 14 depth ghosts); every world here is the same snapshots with their `rules` literal set (ids from ghostId). BUMP-1I P6: was
// "stamped bb-0.15.0 ... the same 230 snapshots" (P1's pool).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Rng, hashSeed } from "../src/core/rng";
import { SEED_POOL } from "../server/seedPoolData";
import { createGhostServer, parseMatchQuery, type GhostServer } from "../server/app";
import { STREAK_VARIANT } from "../tools/samplePool";
import { eligibleWide, isNewPlayer, matchDay, noBetterRecord, type IntRng } from "../src/net/matchmaking";
import { gradeOf, lossesOf, matchPick, medianGrade, PICK_RULE } from "../src/net/pick";
import { checkSnapshot, ghostId, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { fallbackGhost, type FallbackRequest } from "../src/net/fallback";
import { matchUrl, type GhostRequest } from "../src/net/ghostClient";
import { LEAD_RULES } from "../src/net/rulesGate";
import {
  VETERAN, VETERAN_AT, VETERAN_RULE, VETERAN_RULES, VETERAN_SHIELD, VETERAN_STREAK_MAX, VETERAN_TIER_VARIANT, isTierGhost, setVeteran, veteranFallback, veteranFor,
  veteranPick, veteranRules, withVeteran, type VeteranRequest,
} from "../src/net/veteran";

const R15 = "bb-0.15.0", R16 = "bb-0.16.0", R17 = "bb-0.17.0";
const committed: GhostSnapshot[] = SEED_POOL.map((line) => checkSnapshot(JSON.parse(line) as unknown));
const entries = (rules: string): PoolEntry[] => committed.map((s) => { const snapshot = { ...s, rules }; return { id: ghostId(snapshot), snapshot }; });
const POOL15 = entries(R15), POOL16 = entries(R16), POOL17 = entries(R17);

/** A few hundred requests: every record a run can carry into days 1-14 (wins up to 9), four hearts counts. */
function requests(rules: string): VeteranRequest[] {
  const out: VeteranRequest[] = [];
  for (let day = 1; day <= 14; day++) for (let wins = 0; wins <= Math.min(9, day - 1); wins++) for (const lives of [2, 5, 8, 10]) {
    out.push({ rules, day, wins, lives, playerId: "veteran-test", seen: [], runs: 9 });
  }
  return out;
}
const rngFor = (i: number): Rng => new Rng(hashSeed("veteran-test", i));
const same = (a: PoolEntry | null, b: PoolEntry | null): boolean => (a?.id ?? null) === (b?.id ?? null);

beforeAll(() => setVeteran(true));
afterAll(() => setVeteran(VETERAN));

describe("the switch and its constants", () => {
  it("VETERAN is on (P2's flip; it was false at P1), and setVeteran / withVeteran put it back (even on a throw)", () => {
    expect(VETERAN).toBe(true); // BUMP-1I P2: was false (P1's switch-off proof)
    expect(veteranRules()).toBe(true); // the module sets it from the constant (and beforeAll sets it again)
    expect(withVeteran(() => veteranRules(), false)).toBe(false);
    expect(() => withVeteran(() => { throw new Error("x"); }, false)).toThrow("x");
    expect(veteranRules()).toBe(true);
    expect(withVeteran(() => veteranRules())).toBe(true);
  });
  it("the numbers: VETERAN_RULES a literal, VETERAN_AT 2, the cap 99, the rule PICK_RULE plus a lead, the tier's variant = tools/samplePool.ts STREAK_VARIANT", () => {
    expect(VETERAN_RULES).toBe("bb-0.16.0");
    expect(VETERAN_AT).toBe(2);
    expect(VETERAN_STREAK_MAX).toBe(99);
    expect(VETERAN_RULE).toEqual({ ...PICK_RULE, lead: VETERAN_RULE.lead });
    expect(VETERAN_RULE.lead).toBeDefined();
    expect(PICK_RULE.lead).toBeUndefined(); // PICK_RULE itself keeps no lead
    expect(VETERAN_TIER_VARIANT).toBe(STREAK_VARIANT);
    // BUMP-1I P3's take (read E525): the lead { 0.5, 2 } and the shield ON (the tier runs days 5-16 at STREAK_TARGET 525, tools/samplePool.ts)
    expect(VETERAN_RULE.lead).toEqual({ share: 0.5, at: 2 });
    expect(VETERAN_SHIELD).toBe(true);
  });
  it("the tier is the committed pool's 48 `sample-<hero>-3` ghosts, days 5-16 (the shield's mark is the player id)", () => { // BUMP-1I (P3's take E525, P4's R3 6aff36f7): was 24 tier ghosts on days 7-12 of 230 ghosts
    const tier = POOL16.filter(isTierGhost);
    expect(POOL16).toHaveLength(254); // BUMP-1I: was 230
    expect(tier).toHaveLength(48); // BUMP-1I: was 24
    expect([...new Set(tier.map((e) => e.snapshot.day))].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]); // BUMP-1I: was days 7-12
    for (const e of tier) expect(e.snapshot.playerId).toBe(`sample-${e.snapshot.hero}-3`);
    expect(POOL16.filter((e) => !isTierGhost(e))).toHaveLength(206);
  });
  it("veteranFor: the switch, endless, the rules and the streak all count", () => {
    const base: VeteranRequest = { rules: R16, day: 5, wins: 4, lives: 8, playerId: "p", seen: [], runs: 9, streak: 2 };
    expect(veteranFor(base)).toBe(true);
    expect(veteranFor({ ...base, streak: 99 })).toBe(true);
    expect(veteranFor({ ...base, streak: 1 })).toBe(false);
    expect(veteranFor({ ...base, streak: undefined })).toBe(false);
    expect(veteranFor({ ...base, rules: R15 })).toBe(false);
    expect(veteranFor({ ...base, rules: R17 })).toBe(true);
    expect(veteranFor({ ...base, endless: true })).toBe(false);
    expect(withVeteran(() => veteranFor(base), false)).toBe(false);
  });
});

describe("a request that is not a veteran's picks exactly as matchPick does", () => {
  it("a bb-0.15.0 request with any streak (0, 1, 2, 5, 99): the same ghost from the same rng, over every record of days 1-14", () => {
    const reqs = requests(R15);
    expect(reqs.length).toBeGreaterThan(300);
    let n = 0;
    for (const [i, req] of reqs.entries()) for (const streak of [0, 1, 2, 5, 99]) {
      for (const shield of [false, true]) {
        const a = veteranPick(POOL15, { ...req, streak }, rngFor(i), { shield });
        const b = matchPick(POOL15, req, rngFor(i));
        if (!same(a, b)) throw new Error(`bb-0.15.0 day ${req.day} ${req.wins}W${req.lives} streak ${streak} shield ${shield}: ${a?.id} vs ${b?.id}`);
        n++;
      }
    }
    expect(n).toBe(reqs.length * 10);
    expect(reqs.some((r, i) => matchPick(POOL15, r, rngFor(i)) !== null)).toBe(true);
  });

  it("a bb-0.16.0 request with streak 0 or 1 (or none), shield off: the same ghost as matchPick", () => {
    for (const [i, req] of requests(R16).entries()) for (const streak of [undefined, 0, 1]) {
      const r: VeteranRequest = streak === undefined ? req : { ...req, streak };
      const a = veteranPick(POOL16, r, rngFor(i), { shield: false });
      const b = matchPick(POOL16, req, rngFor(i));
      if (!same(a, b)) throw new Error(`bb-0.16.0 day ${req.day} ${req.wins}W${req.lives} streak ${streak}: ${a?.id} vs ${b?.id}`);
    }
  });

  it("the shield on: a request that is not a veteran's never draws a tier ghost while another ghost is eligible (and picks as matchPick on the pool without the tier)", () => {
    const open = POOL16.filter((e) => !isTierGhost(e));
    let tierWouldBeMet = 0, nulls = 0;
    for (const [i, req] of requests(R16).entries()) for (const streak of [undefined, 0, 1]) {
      const r: VeteranRequest = streak === undefined ? req : { ...req, streak };
      const a = veteranPick(POOL16, r, rngFor(i), { shield: true });
      const others = matchPick(open, req, rngFor(i));
      if (others) {
        if (!same(a, others)) throw new Error(`shield, day ${req.day} ${req.wins}W${req.lives}: ${a?.id} vs ${others.id}`);
        expect(isTierGhost(a!)).toBe(false);
        const plain = matchPick(POOL16, req, rngFor(i));
        if (plain && isTierGhost(plain)) tierWouldBeMet++;
      } else {
        nulls++;
        expect(same(a, matchPick(POOL16, req, rngFor(i)))).toBe(true); // nothing else is eligible: the answer is the plain pick (a tier ghost, or null)
      }
    }
    expect(tierWouldBeMet).toBeGreaterThan(0); // the shield bites: without it the pick met a tier ghost in some of these requests
    expect(nulls).toBeGreaterThanOrEqual(0);
  });

  it("the shield draws a tier ghost when nothing else is eligible", () => {
    const tier = POOL16.filter((e) => isTierGhost(e) && e.snapshot.day === 9);
    expect(tier).toHaveLength(4);
    const ghost = tier[0].snapshot;
    const req: VeteranRequest = { rules: R16, day: 9, wins: ghost.wins, lives: ghost.lives, playerId: "veteran-test", seen: [], runs: 9 };
    // a pool of the day's tier ghosts alone: the filtered answer is null, so the whole pool answers
    const a = veteranPick(tier, req, rngFor(1), { shield: true });
    expect(a).not.toBeNull();
    expect(isTierGhost(a!)).toBe(true);
    expect(same(a, matchPick(tier, req, rngFor(1)))).toBe(true);
    // with one other eligible ghost beside them, the other is the answer, every time
    const other: PoolEntry = POOL16.find((e) => !isTierGhost(e) && e.snapshot.day === 9 && noBetterRecord(e.snapshot, req))!;
    expect(other).toBeDefined();
    for (let i = 0; i < 40; i++) expect(veteranPick([...tier, other], req, rngFor(i), { shield: true })!.id).toBe(other.id);
  });

  it("a null answer leaves the rng untouched (matchPick's, the shield's second try and the veteran's)", () => {
    const counting = () => { const c = { n: 0, int(k: number) { c.n++; return k - 1; } }; return c as IntRng & { n: number }; };
    const none: VeteranRequest = { rules: R16, day: 1, wins: 0, lives: 1, playerId: "veteran-test", seen: POOL16.filter((e) => e.snapshot.day === 1).map((e) => e.id), runs: 9 };
    for (const streak of [0, 2]) for (const shield of [false, true]) {
      const r = counting();
      expect(veteranPick(POOL16, { ...none, streak }, r, { shield })).toBeNull();
      expect(r.n).toBe(0);
    }
    const r2 = counting();
    expect(veteranPick([], { ...none, streak: 0 }, r2, { shield: true })).toBeNull();
    expect(r2.n).toBe(0);
    // an answer draws exactly once
    const r3 = counting();
    expect(veteranPick(POOL16, { rules: R16, day: 3, wins: 2, lives: 8, playerId: "p", seen: [], runs: 9 }, r3, { shield: true })).not.toBeNull();
    expect(r3.n).toBe(1);
  });
});

describe("a veteran's request takes the lead pick", () => {
  /** The k-th largest grade among the eligible ghosts (k = ceil(share n)): a pick from the strongest share has at least this grade. */
  function floorOf(pool: PoolEntry[], req: VeteranRequest, share: number): { n: number; k: number; floor: number } {
    const ok = eligibleWide(pool, req);
    const day = matchDay(pool, req);
    const median = medianGrade(pool.filter((e) => e.snapshot.rules === req.rules && e.snapshot.day === day));
    const grades = ok.map((e) => gradeOf(e, median)).sort((a, b) => b - a);
    const k = Math.max(1, Math.ceil(share * grades.length));
    return { n: grades.length, k, floor: grades[k - 1] };
  }
  const ahead = (req: VeteranRequest): number => req.wins - lossesOf(req);

  it("streak 2 and a record `at` or more wins ahead: the pick is from the strongest share by grade; the lead changes the ghost met in some of them", () => {
    const lead = VETERAN_RULE.lead!;
    let applied = 0, changed = 0;
    for (const [i, req] of requests(R16).entries()) {
      if (ahead(req) < lead.at) continue;
      const r: VeteranRequest = { ...req, streak: 2 };
      const a = veteranPick(POOL16, r, rngFor(i), { shield: false });
      if (!a) continue;
      const { floor } = floorOf(POOL16, r, lead.share);
      if ((a.snapshot.grade ?? 0) < floor) throw new Error(`day ${req.day} ${req.wins}W${req.lives}: grade ${a.snapshot.grade} under the strongest share's floor ${floor}`);
      expect(noBetterRecord(a.snapshot, req)).toBe(true); // D1 holds for a veteran too
      expect(a.snapshot.day).toBeLessThanOrEqual(req.day);
      applied++;
      if (!same(a, matchPick(POOL16, req, rngFor(i)))) changed++;
    }
    expect(applied).toBeGreaterThan(60);
    expect(changed).toBeGreaterThan(0);
  });

  it("streak 2 but a record under `at` wins ahead: the pick is matchPick's", () => {
    const lead = VETERAN_RULE.lead!;
    let n = 0;
    for (const [i, req] of requests(R16).entries()) {
      if (ahead(req) >= lead.at) continue;
      expect(same(veteranPick(POOL16, { ...req, streak: 2 }, rngFor(i), { shield: false }), matchPick(POOL16, req, rngFor(i)))).toBe(true);
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });

  it("the bench's options: a lead { 0.34, at 0 } reaches an even record; the veteran's rule and the base rule can be passed", () => {
    const wide = { ...PICK_RULE, lead: { share: 0.34, at: 0 } };
    let even = 0, differs = 0;
    for (const [i, req] of requests(R16).entries()) {
      if (ahead(req) !== 0) continue; // an even record: as many wins as losses
      const r: VeteranRequest = { ...req, streak: 2 };
      const a = veteranPick(POOL16, r, rngFor(i), { rule: wide, shield: false });
      if (a) {
        const { floor } = floorOf(POOL16, r, 0.34);
        expect(a.snapshot.grade ?? 0).toBeGreaterThanOrEqual(floor);
      }
      even++;
      if (!same(a, matchPick(POOL16, req, rngFor(i)))) differs++;
      // the default veteran rule (at 2) does not reach an even record: matchPick's pick
      expect(same(veteranPick(POOL16, r, rngFor(i), { shield: false }), matchPick(POOL16, req, rngFor(i)))).toBe(true);
    }
    expect(even).toBeGreaterThan(10);
    expect(differs).toBeGreaterThan(0);
    // a base rule can be passed too: the stricter `deep` share a request far behind draws from
    const strict = { losing: 1, deep: 0.25, deepAt: 2 };
    const far: VeteranRequest = { rules: R16, day: 12, wins: 2, lives: 5, playerId: "veteran-test", seen: [], runs: 9 }; // 2 wins, 9 losses: far behind
    for (let i = 0; i < 30; i++) expect(same(veteranPick(POOL16, far, rngFor(i), { base: strict }), matchPick(POOL16, far, rngFor(i), strict))).toBe(true);
  });

  it("a veteran's request meets tier ghosts, shield or no shield (the shield is for the others)", () => {
    let tierMet = 0;
    for (const [i, req] of requests(R16).entries()) {
      const r: VeteranRequest = { ...req, streak: 3 };
      const a = veteranPick(POOL16, r, rngFor(i), { shield: true });
      const b = veteranPick(POOL16, r, rngFor(i), { shield: false });
      expect(same(a, b)).toBe(true);
      if (a && isTierGhost(a)) tierMet++;
    }
    expect(tierMet).toBeGreaterThan(0);
  });
});

describe("D1, the new-player pool (D2) and an endless request are as today for a veteran too", () => {
  it("D1: a veteran never meets a ghost with a better record than its own", () => {
    for (const [i, req] of requests(R16).entries()) {
      for (const shield of [false, true]) {
        const a = veteranPick(POOL16, { ...req, streak: 2 }, rngFor(i), { shield });
        if (a) expect(noBetterRecord(a.snapshot, req)).toBe(true);
      }
    }
  });

  it("D2: the route's bucket choice is made before the pick and ignores the streak (isNewPlayer reads `runs` alone)", () => {
    expect(isNewPlayer({ runs: 2 })).toBe(true);
    expect(isNewPlayer({ runs: 3 })).toBe(false);
    expect(isNewPlayer({})).toBe(true);
    // a new player's bucket is the seed pool: the pick over it is the pick over a pool of seed ghosts only, streak or not
    const seedOnly = POOL16.filter((e) => e.snapshot.playerId.startsWith("sample-"));
    expect(seedOnly).toHaveLength(POOL16.length);
    const req: VeteranRequest = { rules: R16, day: 4, wins: 3, lives: 9, playerId: "veteran-test", seen: [], runs: 2, streak: 2 };
    for (let i = 0; i < 30; i++) {
      const a = veteranPick(seedOnly, req, rngFor(i));
      expect(a).not.toBeNull();
      expect(a!.snapshot.playerId.startsWith("sample-")).toBe(true);
    }
  });

  it("an endless request picks as matchPick does, with any streak (endless ghosts only, nearest endless wins)", () => {
    // fabricated endless ghosts (the pick reads mode, endlessWins, day, rules and the player id; no id is checked here)
    const endlessGhosts: PoolEntry[] = [3, 8, 14].map((w, k) => {
      const base = POOL16.find((e) => e.snapshot.day === 12)!.snapshot;
      const snapshot = { ...base, wins: 10, playerId: `endless-${k}`, mode: "endless", endlessWins: w, endlessLives: 3, day: 30 } as unknown as GhostSnapshot;
      return { id: `gendless${k}`, snapshot };
    });
    const pool = [...POOL16, ...endlessGhosts];
    const req: VeteranRequest = { rules: R16, day: 30, wins: 7, lives: 4, playerId: "veteran-test", seen: [], runs: 9, endless: true };
    for (let i = 0; i < 40; i++) for (const streak of [undefined, 0, 2, 50]) {
      const a = veteranPick(pool, streak === undefined ? req : { ...req, streak }, rngFor(i), { shield: true });
      const b = matchPick(pool, req, rngFor(i));
      expect(same(a, b)).toBe(true);
      if (b) expect((b.snapshot as { mode?: string }).mode).toBe("endless");
    }
  });
});

describe("the switch off: every request picks as today at every rules label", () => {
  it("bb-0.15.0, bb-0.16.0 and bb-0.17.0, streak 0, 2 and 7, the shield asked or not", () => {
    withVeteran(() => {
      for (const [rules, pool] of [[R15, POOL15], [R16, POOL16], [R17, POOL17]] as const) {
        for (const [i, req] of requests(rules).entries()) {
          if (i % 3) continue;
          for (const streak of [0, 2, 7]) for (const shield of [false, true]) {
            const a = veteranPick(pool, { ...req, streak }, rngFor(i), { shield });
            if (!same(a, matchPick(pool, req, rngFor(i)))) throw new Error(`${rules} day ${req.day} ${req.wins}W${req.lives} streak ${streak}`);
          }
        }
      }
    }, false);
  });
  it("a request under rules before VETERAN_RULES and the lead pick's own gate are untouched (LEAD_RULES stays bb-0.15.0)", () => {
    expect(LEAD_RULES).toBe("bb-0.15.0");
    expect(VETERAN_RULES > LEAD_RULES).toBe(true);
  });
});

describe("the offline fallback", () => {
  const fb = (over: Partial<FallbackRequest & { streak?: number }> = {}): FallbackRequest & { streak?: number } => ({
    rules: R15, day: 3, wins: 2, lives: 7, playerId: "veteran-test", seen: [], runs: 9, hero: "weaver", seed: 4242, ...over,
  });
  it("veteranFallback equals fallbackGhost for a request that is not a veteran's, shield off (a pool hit, and the stand-in when none is left)", () => {
    for (const req of [fb(), fb({ day: 9, wins: 4, lives: 3 }), fb({ streak: 1 }), fb({ streak: 7 })]) {
      expect(veteranFallback(req, POOL15)).toEqual(fallbackGhost(req, POOL15));
      expect(veteranFallback(req, [])).toEqual(fallbackGhost(req, []));
      expect(veteranFallback(req)).toEqual(fallbackGhost(req));
    }
    for (const req of [fb({ rules: R16 }), fb({ rules: R16, streak: 1, day: 6, wins: 5, lives: 4 })]) {
      expect(veteranFallback(req, POOL16, { shield: false })).toEqual(fallbackGhost(req, POOL16)); // BUMP-1I P3's take: VETERAN_SHIELD is on, so "shield off" is asked for
    }
  });
  it("a veteran's offline request takes the lead pick: a ghost from the strongest share, else the stand-in as before", () => {
    const req = fb({ rules: R16, day: 6, wins: 5, lives: 4, streak: 2 });
    const hit = veteranFallback(req, POOL16);
    expect(hit.id).toBe(veteranPick(POOL16, req, new Rng(req.seed))!.id);
    const lone = fb({ rules: R16, day: 6, wins: 5, lives: 4, streak: 2 });
    expect(veteranFallback(lone, [])).toEqual(fallbackGhost({ ...lone, streak: undefined } as FallbackRequest, []));
  });
});

describe("the request URL and the server", () => {
  const url = (over: Partial<GhostRequest> = {}): string => matchUrl("https://ghosts.example/", {
    rules: R15, day: 3, wins: 1, lives: 4, playerId: "p-1", seen: ["gaa", "gbb"], hero: "furnace", seed: 7, runs: 2, ...over,
  });
  const TODAY = "https://ghosts.example/v1/ghosts/match?rules=bb-0.15.0&day=3&wins=1&lives=4&player=p-1&seen=gaa%2Cgbb&runs=2";
  it("a request with no streak (or 0) has the URL it has today, byte for byte; above 0 it adds streak and nothing else", () => {
    expect(url()).toBe(TODAY);
    expect(url({ streak: 0 })).toBe(TODAY);
    expect(url({ streak: 2 })).toBe(`${TODAY}&streak=2`);
    expect(url({ streak: 2, endless: true })).toBe(`${TODAY}&streak=2&mode=endless`);
    expect(url({ endless: true })).toBe(`${TODAY}&mode=endless`);
  });

  it("parseMatchQuery: absent streak adds nothing (reads as 0); 0..99 parse; x, 100, -1, 1.5 and an empty value are a 400", () => {
    const q = (extra: string) => new URLSearchParams(`rules=${R16}&day=3&wins=1&lives=4&player=${"A".repeat(43)}&runs=5${extra}`);
    const absent = parseMatchQuery(q(""));
    expect(absent.streak).toBeUndefined();
    expect(veteranFor(absent)).toBe(false);
    expect(parseMatchQuery(q("&streak=0")).streak).toBe(0);
    expect(parseMatchQuery(q("&streak=2")).streak).toBe(2);
    expect(parseMatchQuery(q("&streak=99")).streak).toBe(99);
    for (const bad of ["x", "100", "-1", "1.5", "", "0x2", "1e1", "+2"]) {
      expect(() => parseMatchQuery(q(`&streak=${bad}`)), `streak=${bad}`).toThrow(/^streak: expected an integer in 0\.\.99/);
    }
  });

  describe("the route (in-process server)", () => {
    let dir: string;
    let app: GhostServer;
    let base: string;
    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), "bb-veteran-"));
      app = createGhostServer({ dataDir: dir, uploads: "closed", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 1000 } });
      base = `http://127.0.0.1:${await app.listen(0)}`;
    });
    afterAll(async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    });
    const get = async (extra: string): Promise<number> => (await fetch(`${base}/v1/ghosts/match?rules=${R16}&day=3&wins=1&lives=4&player=${"A".repeat(43)}&seen=&runs=5${extra}`)).status;
    it("answers 400 to streak=x and streak=100, and reads an absent streak as 0 (an empty store: 404 for any good request)", async () => {
      expect(await get("&streak=x")).toBe(400);
      expect(await get("&streak=100")).toBe(400);
      expect(await get("&streak=-1")).toBe(400);
      expect(await get("&streak=")).toBe(400);
      expect(await get("")).toBe(404);
      expect(await get("&streak=0")).toBe(404);
      expect(await get("&streak=2")).toBe(404);
      expect(await get("&streak=99")).toBe(404);
    });
  });
});
