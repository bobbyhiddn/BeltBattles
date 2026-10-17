// RUN-1 T3c (REQ-BFG-059, REQ-BFG-116; R1.2): under a long run's rules (rulesGate.ts longRunFor) an upload STATES its `losses`.
// Without them the record check (records.ts) takes any run that reaches (wins, lives), which cannot tell up to MAX_RUN_DRAWS
// draws plus a PATCH UP from losses. So:
//  - POST /v1/ghosts refuses a long-run upload without `losses` (422, the reason names the field) and takes the same upload with it;
//  - a 10-day upload is unchanged (the switch off, as shipped: no `losses` needed, and the field is still refused as reserved);
//  - the pool check (server/seed.ts checkPool) and ghosts:admin's revalidate (server/ghostAdmin.ts uploadProblems) pass `losses` to
//    isReachable: an honest day-14 record that has `losses` is kept, one whose losses contradict its hearts is found.
// The honest runs are played through the game's own code (tests/run1.honest.ts), as tests/run1.server.test.ts does.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { setLongRun, withLongRun } from "../src/sim/longRun";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { decodeSnapshot, encodeSnapshot, ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { isReachable, lossesProblem } from "../src/net/records";
import { uploadProblems, type StoredRecord } from "../server/ghostAdmin";
import { checkPool, SeedError } from "../server/seed";
import { encodeRecord } from "../server/store";
import type { GhostServer } from "../server/app";
import type { Identity } from "../src/net/identity";
import { storeBackends } from "./netStores";
import { signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { playLongRun, type LongPlayed } from "./run1.honest";

setPlayerName(TEST_NAME);

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const RUNS_PER_HERO = 3;
const UNTIL = 16;
const runs: LongPlayed[] = [];
let me: Identity;
let all: GhostSnapshot[];

/** `s` without its `losses` (a long run's upload as an older or a careless client would send it). */
const bare = (s: GhostSnapshot): GhostSnapshot => {
  const { losses: _losses, ...rest } = s;
  return rest as GhostSnapshot;
};
/** The deepest honest dusk with at least one loss. */
const deepest = (min: number): GhostSnapshot => {
  const s = all.filter((x) => x.day >= min && (x.losses ?? 0) >= 1).sort((a, b) => b.day - a.day)[0];
  if (!s) throw new Error(`no honest snapshot of day ${min} or later with a loss in the played runs`);
  return s;
};
const stored = (s: GhostSnapshot, id = ghostId(s)): StoredRecord => ({
  ref: "ghosts.jsonl:1", kind: "upload", day: s.day, id, playerId: s.playerId, text: encodeRecord(id, 5, s), keyed: false,
});

beforeAll(async () => {
  setLongRun(true);
  me = await testIdentity(0);
  for (const hero of HEROES) for (let i = 0; i < RUNS_PER_HERO; i++) runs.push(playLongRun(hero, i, me.playerId, UNTIL));
  all = runs.flatMap((r) => r.snaps);
}, 600_000);

afterAll(() => setLongRun(false));

describe("RUN-1 T3c: lossesProblem (records.ts), the one rule", () => {
  it("long-run rules: a missing `losses` is a reason that names the field; stated losses (0 too) are fine", () => {
    expect(lossesProblem(RULES_VERSION, undefined)).toMatch(/^losses: /);
    expect(lossesProblem(RULES_VERSION, undefined)).toContain("snapshot.losses");
    expect(lossesProblem(RULES_VERSION, 0)).toBeNull();
    expect(lossesProblem(RULES_VERSION, 5)).toBeNull();
  });

  it("the 10-day rules ask nothing: the switch off (as shipped), and rules before the long run's", () => {
    withLongRun(() => expect(lossesProblem("bb-0.9.7", undefined)).toBeNull(), true); // switch on, but the rules are older than LONG_RUN_RULES
    withLongRun(() => {
      expect(lossesProblem(RULES_VERSION, undefined)).toBeNull();
      expect(lossesProblem(undefined, undefined)).toBeNull(); // not readable rules: not a long run's
    }, false);
  });
});

describe.each(storeBackends())("RUN-1 T3c: POST /v1/ghosts on the $name store asks a long run for its `losses`", (backend) => {
  let app: GhostServer, base: string;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  const post = async (s: GhostSnapshot): Promise<{ status: number; body: Record<string, unknown> }> => {
    const body = JSON.stringify(s); // not encodeSnapshot: the server's own checks must see it as sent
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };

  it("an honest day-14+ upload WITHOUT `losses` is refused: 422, and the reason names `losses`; nothing is stored", async () => {
    const s = deepest(14);
    expect(s.day).toBeGreaterThanOrEqual(14);
    const before = app.store.size;
    const r = await post(bare(s));
    expect(r.status).toBe(422);
    expect(String(r.body.error)).toMatch(/^losses: /);
    expect(String(r.body.error)).toContain("snapshot.losses");
    expect(app.store.size).toBe(before);
  }, 120_000);

  it("the same upload WITH its `losses` is taken: 201, then 200 again; the record keeps them", async () => {
    const s = deepest(14);
    const r = await post(s);
    expect([r.status, r.body]).toEqual([201, { id: ghostId(s) }]);
    expect((await post(s)).status).toBe(200);
    const stored = await app.store.bucket(RULES_VERSION, s.day);
    expect(stored.some((e) => e.id === ghostId(s) && e.snapshot.losses === s.losses)).toBe(true);
  }, 120_000);

  it("`losses: 0` is a statement too (a run that has not lost yet): taken, not mistaken for a missing field", async () => {
    const s = all.find((x) => x.day >= 3 && x.losses === 0 && x.wins >= 1);
    expect(s, "an honest dusk with no loss yet").toBeDefined();
    const r = await post(s!);
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
  });

  it("the order of the checks: an unreachable record without `losses` keeps its record: reason (the record is checked first)", async () => {
    const s = all.find((x) => x.day >= 12)!;
    const r = await post({ ...bare(s), wins: 0, lives: 10 });
    expect(r.status).toBe(422);
    expect(String(r.body.error)).toMatch(/^record: 0W 10 lives is no record a run carries into dusk/);
  });

  it("a 10-day upload is UNCHANGED: with the switch off an upload needs no `losses`, and the field is still refused as reserved", async () => {
    const early = all.find((x) => x.day >= 3 && x.day <= 9 && !x.lastChance && x.wins >= 1)!;
    expect(early, "an honest dusk before day 10").toBeDefined();
    setLongRun(false);
    try {
      const plain = await post(bare(early));
      expect(plain.status, JSON.stringify(plain.body)).toBeLessThan(300); // no `losses`: taken, as before the long run
      const withLosses = await post({ ...early, runId: "run1-losses-10day", losses: early.losses });
      expect(withLosses.status).toBe(400); // the 10-day rules keep v3 `losses` reserved (snapshot.ts V3_LIVE)
      expect(String(withLosses.body.error)).toMatch(/snapshot\.losses/);
    } finally {
      setLongRun(true);
    }
  }, 120_000);
});

describe("RUN-1 T3c: the pool check and ghosts:admin's revalidate pass `losses` to isReachable", () => {
  it("revalidate KEEPS an honest day-14+ record that has `losses` (and one that has none: it asks nothing)", () => {
    const s = deepest(14);
    expect(uploadProblems(stored(s), RULES_VERSION)).toEqual([]);
    expect(uploadProblems(stored(bare(s)), RULES_VERSION)).toEqual([]);
  });

  it("revalidate FINDS a record whose losses contradict its hearts (it kept it before `losses` reached isReachable), naming the losses", () => {
    const lc = (s: GhostSnapshot) => s.lastChance?.day ?? null;
    // fewer losses than the run had, the same wins and hearts: the loose model keeps it (the honest run reaches it), the exact one does not
    const s = all.find((x) => x.day >= 8 && (x.losses ?? 0) >= 1 && x.day - 1 - x.wins - (x.losses! - 1) <= 8
      && !isReachable(x.day, x.wins, x.lives, { lastChance: lc(x), rules: x.rules, losses: x.losses! - 1 }))!;
    expect(s, "an honest dusk whose hearts need all its losses").toBeDefined();
    const forged = { ...s, losses: s.losses! - 1 };
    expect(isReachable(forged.day, forged.wins, forged.lives, { lastChance: lc(forged), rules: forged.rules })).toBe(true); // the loose model
    const problems = uploadProblems(stored(forged), RULES_VERSION);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(new RegExp(`^record: ${forged.wins}W ${forged.lives} lives and ${forged.losses} losses is no record a run carries into dusk ${forged.day}`));
  });

  it("the seed pool's checkPool takes an honest day-14+ record with `losses` and refuses one whose losses contradict its hearts", () => {
    const s = deepest(14);
    const ok = decodeSnapshot(encodeSnapshot(s));
    expect(checkPool([JSON.parse(encodeSnapshot(ok))]).map((e) => e.id)).toEqual([ghostId(s)]);
    const lc = (x: GhostSnapshot) => x.lastChance?.day ?? null;
    const t = all.find((x) => x.day >= 8 && (x.losses ?? 0) >= 1 && x.day - 1 - x.wins - (x.losses! - 1) <= 8
      && !isReachable(x.day, x.wins, x.lives, { lastChance: lc(x), rules: x.rules, losses: x.losses! - 1 }))!;
    expect(t).toBeDefined();
    const forged = { ...t, losses: t.losses! - 1 };
    expect(() => checkPool([JSON.parse(encodeSnapshot(forged))])).toThrow(SeedError);
    expect(() => checkPool([JSON.parse(encodeSnapshot(forged))])).toThrow(/record \d+W \d+ lives: no run carries it into dusk/);
  });
});
