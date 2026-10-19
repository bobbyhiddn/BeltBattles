// RUN-1 T3 (REQ-BFG-059, REQ-BFG-116; D4, D6): the server side of the long run, end to end, with the switch on (the shipped value
// is off, so the file turns it on for itself and puts it back). Honest long runs are played through the game's own functions
// (tests/run1.honest.ts: the dawn's rune, the caravan, the fork, the NPC day's event, REFIT, the dusk), and every dusk's
// snapshot is the one the game uploads (day.ts ghostOf) plus the run's `losses`:
//  - an HONEST ghost past day 10 is accepted: validateUpload (the deck, with its seed, LAST CHANCE and road log), the record
//    (records.ts isReachable with the snapshot's losses), the codec and the client's check, for every dusk of every run, and
//    POST /v1/ghosts answers 201 for the deepest ones, on the JSON-lines store and on Tigris;
//  - REFUSED: 10 wins on a run ghost, hearts that don't match the losses, a record its day cannot reach, too many draws
//    (more than MAX_RUN_DRAWS = 8), a day past 25, and (D6) a thin day widens to the nearest EARLIER day, never a later one.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { MAX_RUN_DRAWS, setLongRun } from "../src/sim/longRun";
import { ENDLESS, ENDLESS_LAST_DAY, setEndless } from "../src/sim/endless"; // BUMP-1E: ENDLESS ships on (bb-0.12.0): a store's day bound under rules with endless is ENDLESS_LAST_DAY
import { isSnapshot, setPlayerName } from "../src/game/ghostSnapshot";
import { decodeSnapshot, encodeSnapshot, ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { isReachable } from "../src/net/records";
import { validateUpload } from "../src/net/validate";
import { fetchGhost } from "../src/net/ghostClient";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import { storeBackends } from "./netStores";
import { signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { playLongRun, type LongPlayed } from "./run1.honest";

setPlayerName(TEST_NAME); // the device has a player name, so ghostOf carries it as the game uploads it

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const RUNS_PER_HERO = 6;
const UNTIL = 16; // each run is played to the dawn of day 16, or to its end

/** The checks POST /v1/ghosts runs on a snapshot, as server/app.ts runs them, without the HTTP: the first problem or null. */
function problem(s: GhostSnapshot): string | null {
  let d: GhostSnapshot;
  try {
    d = decodeSnapshot(encodeSnapshot(s));
  } catch (e) {
    return `codec: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (!isSnapshot(d)) return "isSnapshot refuses what the decoder takes";
  const v = validateUpload(d.build, d.day, d.rules, { seed: d.seed, ...(d.lastChance ? { lastChance: d.lastChance } : {}), ...(d.road ? { road: d.road } : {}) });
  if (!v.ok) return `deck: ${v.errors[0]}`;
  if (!isReachable(d.day, d.wins, d.lives, { lastChance: d.lastChance?.day ?? null, rules: d.rules, ...(d.losses !== undefined ? { losses: d.losses } : {}) })) {
    return `record: ${d.wins}W ${d.lives} lives ${d.losses ?? "?"} losses at dusk ${d.day}`;
  }
  return null;
}

const runs: LongPlayed[] = [];
let me: Identity;
let deep: GhostSnapshot[]; // per run, its deepest dusk past day 10

beforeAll(async () => {
  setLongRun(true);
  me = await testIdentity(0);
  for (const hero of HEROES) for (let i = 0; i < RUNS_PER_HERO; i++) runs.push(playLongRun(hero, i, me.playerId, UNTIL));
  deep = runs.map((r) => r.snaps[r.snaps.length - 1]).filter((s) => s.day > 10);
}, 600_000);

afterAll(() => setLongRun(false));

describe("RUN-1: honest long runs through the game's own code upload only what the server takes (D4)", () => {
  it("every dusk of every run: the codec, the client's check, the deck and the record with its losses", () => {
    const refused: string[] = [];
    let dusks = 0, past10 = 0, past13 = 0;
    for (const r of runs) {
      for (const s of r.snaps) {
        dusks++;
        if (s.day > 10) past10++;
        if (s.day > 13) past13++;
        const p = problem(s);
        if (p) refused.push(`${r.hero} d${s.day} ${s.wins}W ${s.lives}L ${s.losses}: ${p}`);
        expect(s.losses, `${r.hero} d${s.day}`).toBe(r.run.history.slice(0, s.day - 1).filter((h) => h.outcome === "loss").length);
      }
    }
    expect(refused).toEqual([]);
    // the runs go past day 10, and past day 13: the claim is about a day-14 ghost
    expect(runs).toHaveLength(HEROES.length * RUNS_PER_HERO);
    expect(past10).toBeGreaterThan(20);
    expect(past13, `${past13} dusks past day 13 of ${dusks}`).toBeGreaterThan(5);
    expect(deep.length).toBeGreaterThan(5);
    expect(Math.max(...deep.map((s) => s.day))).toBeGreaterThanOrEqual(14);
  }, 600_000);

  it("LAST CHANCE on day 10 or later (D3) is among the honest uploads, and they pass: the deck's rune at its place, the record's day", () => {
    const late = runs.flatMap((r) => r.snaps).filter((s) => s.lastChance && s.lastChance.day >= 10);
    expect(late.length, "honest dusks after a LAST CHANCE on day 10 or later").toBeGreaterThan(0);
    for (const s of late) {
      expect(s.day).toBeGreaterThan(s.lastChance!.day);
      expect(problem(s), `${s.hero} d${s.day} LAST CHANCE ${s.lastChance!.day}`).toBeNull();
      expect(isReachable(s.day, s.wins, s.lives, { lastChance: s.lastChance!.day, rules: s.rules, losses: s.losses })).toBe(true);
    }
  });

  it("the gold budget still bites past day 10: an honest day-12+ deck with 150 more plates (+37,500 hull) is refused", () => {
    // the bag reset widens what the road can have given a long run (a second bag's events), it does not lift the ceiling
    const deckAt = runs.flatMap((r) => r.snaps).filter((x) => x.day >= 12).slice(0, 8);
    expect(deckAt.length).toBeGreaterThan(3);
    for (const s of deckAt) {
      const rich = { ...s.build, hullBonus: s.build.hullBonus + 150 * 250 };
      const v = validateUpload(rich, s.day, s.rules, { seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}), ...(s.road ? { road: s.road } : {}) });
      expect(v.ok, `${s.hero} d${s.day}`).toBe(false);
      expect(v.errors[0], `${s.hero} d${s.day}`).toMatch(/^(budget|supply): /);
    }
  });

  it("the runs took the road past day 10 more than once: the dock's PLATING or PATCH UP in a second bag", () => {
    const second = runs.filter((r) => r.run.history.length > 10); // played day 11 or later: a second event bag
    expect(second.length).toBeGreaterThan(5);
    expect(runs.reduce((n, r) => n + r.dock.plating + r.dock.patchUp, 0)).toBeGreaterThan(0);
  });
});

describe.each(storeBackends())("RUN-1 POST /v1/ghosts and the match route on the $name store (a long run's rules)", (backend) => {
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
    const body = JSON.stringify(s); // not encodeSnapshot: a forged snapshot must reach the server's own checks
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  const pick = (test: (s: GhostSnapshot) => boolean): GhostSnapshot => {
    const s = runs.flatMap((r) => r.snaps).find(test);
    if (!s) throw new Error("no honest snapshot for this test in the played runs");
    return s;
  };

  it("an HONEST ghost past day 10 (the deepest of each run, a day-14 one among them) is stored: 201, and the same again 200", async () => {
    const day14 = deep.filter((s) => s.day >= 14);
    expect(day14.length).toBeGreaterThan(0);
    for (const s of deep) {
      const r = await post(s);
      expect([r.status, r.body], `${s.hero} d${s.day} ${s.wins}W ${s.lives}L ${s.losses}L`).toEqual([201, { id: ghostId(s) }]);
    }
    const again = await post(day14[0]);
    expect(again.status).toBe(200);
    expect(app.store.size).toBe(new Set(deep.map((s) => ghostId(s))).size);
    // the stored record keeps its day and its losses
    const stored = await app.store.bucket(RULES_VERSION, day14[0].day);
    expect(stored.some((e) => e.id === ghostId(day14[0]) && e.snapshot.losses === day14[0].losses)).toBe(true);
  }, 120_000);

  it("REFUSED: 10 or more wins on a run ghost (a dusk is before the 10th win)", async () => {
    const s = pick((x) => x.day >= 12);
    const r = await post({ ...s, wins: 10 });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/snapshot\.wins: expected an integer in 0\.\.9/);
    expect((await post({ ...s, wins: 11 })).status).toBe(400);
  });

  it("REFUSED: hearts that do not match the losses (10 hearts after 3 or more losses; the same deck with its true record is taken)", async () => {
    const s = pick((x) => x.day >= 8 && (x.losses ?? 0) >= 3 && x.lives < 10 && x.day - 1 - x.wins - (x.losses ?? 0) <= MAX_RUN_DRAWS);
    const r = await post({ ...s, lives: 10 });
    expect(r.status).toBe(422);
    expect(String(r.body.error)).toMatch(/^record: .* is no record a run carries into dusk/);
    expect(String(r.body.error)).toContain(`${s.losses} losses`);
    // fewer losses than it played, with its true hearts: 5 losses' hearts can't be a run of 0 losses either
    const fewer = await post({ ...s, losses: 0 });
    expect([400, 422]).toContain(fewer.status); // 400 when that leaves more than 8 draws, else the record model's 422
    expect((await post(s)).status).toBeLessThan(300); // the true record: 200 or 201
  });

  it("REFUSED: a record its day cannot reach (12 or more dusks, 0 wins, 10 hearts)", async () => {
    const s = pick((x) => x.day >= 12);
    const { losses: _drop, ...noLosses } = s;
    const r = await post({ ...noLosses, wins: 0, lives: 10 });
    expect(r.status).toBe(422);
    expect(String(r.body.error)).toMatch(/^record: 0W 10 lives is no record a run carries into dusk/);
  });

  it("REFUSED: too many draws (more than MAX_RUN_DRAWS = 8): the snapshot's losses leave 9", async () => {
    const s = pick((x) => x.day >= 14);
    const r = await post({ ...s, wins: 1, losses: s.day - 1 - 1 - (MAX_RUN_DRAWS + 1) });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/draws in \d+ dusks is past 8/);
    // exactly 8 draws is the most: the decoder takes it (the record model decides the rest)
    const edge = await post({ ...s, wins: 1, losses: s.day - 1 - 1 - MAX_RUN_DRAWS });
    expect(edge.status).not.toBe(400);
  });

  it("REFUSED: a day past 25, and a day its rules cannot state", async () => {
    const s = pick((x) => x.day >= 12);
    const far = await post({ ...s, day: 26 });
    expect(far.status).toBe(400);
    expect(String(far.body.error)).toMatch(/snapshot\.day: expected an integer in 1\.\.25/);
    expect((await post({ ...s, day: 0 })).status).toBe(400);
    // a day-14 deck under the 10-day rules is refused (the rules gate keeps older rules' bound)
    const old = await post({ ...s, rules: "bb-0.9.7" });
    expect([400, 422]).toContain(old.status);
  });
});

describe.each(storeBackends())("RUN-1 D6: the match route on the $name store widens a thin day to the nearest EARLIER day", (backend) => {
  let app: GhostServer, base: string;
  let g12: GhostSnapshot, g6: GhostSnapshot;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    const all = runs.flatMap((r) => r.snaps);
    g12 = all.find((x) => x.day === 12 && x.wins >= 1 && x.wins < 9)!;
    g6 = all.find((x) => x.day === 6 && x.wins >= 1 && x.wins < 9)!;
    for (const s of [g12, g6]) {
      const body = JSON.stringify(s);
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      expect(r.status, `${s.hero} d${s.day}`).toBe(201);
    }
  });
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  const get = async (day: number, over: Record<string, string> = {}) => {
    const q = new URLSearchParams({ rules: RULES_VERSION, day: String(day), wins: "9", lives: "10", player: "p-someone-else", seen: "", runs: "5", ...over });
    const r = await fetch(`${base}/v1/ghosts/match?${q}`);
    return { status: r.status, body: (await r.json()) as { id?: string; snapshot?: GhostSnapshot; error?: string } };
  };

  it("the exact day first, then the nearest earlier day with a ghost; never a later one", async () => {
    expect((await get(12)).body.snapshot?.day).toBe(12);
    expect((await get(14)).body.snapshot?.day).toBe(12); // days 14 and 13 are empty: day 12's
    expect((await get(25)).body.snapshot?.day).toBe(12);
    expect((await get(11)).body.snapshot?.day).toBe(6); // day 12 is LATER than 11: never; days 11-7 are empty: day 6's
    expect((await get(6)).body.snapshot?.day).toBe(6);
    expect((await get(5)).status).toBe(404); // both ghosts are later days
    expect((await get(1)).status).toBe(404);
  });

  it("the record rule (D1) and `seen` still hold on the widened day", async () => {
    const own = await get(14);
    expect(own.body.id).toBe(ghostId(g12));
    expect((await get(14, { seen: ghostId(g12) })).body.snapshot?.day).toBe(6); // seen: on to the next earlier day
    expect((await get(14, { seen: `${ghostId(g12)},${ghostId(g6)}` })).status).toBe(404);
    // a requester with fewer wins than both ghosts meets neither (never a better record)
    expect((await get(14, { wins: "0", lives: "10" })).status).toBe(404);
  });

  it("data safety on the stores: Tigris keeps a day bucket past 10 only under a long run's rules (the JSON-lines store keeps any day)", async () => {
    const id12 = ghostId(g12); // (its id needs the long run's rules to encode)
    expect((await app.store.bucket(RULES_VERSION, 12)).map((e) => e.id)).toEqual([id12]);
    expect(await app.store.bucket(RULES_VERSION, 26)).toEqual([]); // past the bound: nothing can be stored there (BUMP-1E: nothing is stored on day 26; the bound is the next line's)
    // BUMP-1E: ENDLESS ships on (the file runs in the shipped world, long run and endless both on): under rules with endless the Tigris store's day
    // buckets run to ENDLESS_LAST_DAY (tigrisStore.ts endlessMaxDay), the run's 25 days and beyond; past it nothing can be stored
    expect(ENDLESS).toBe(true);
    expect(await app.store.bucket(RULES_VERSION, ENDLESS_LAST_DAY + 1)).toEqual([]);
    expect(await app.store.bucket("bb-0.9.7", 12)).toEqual([]); // older rules keep 10 (and hold no ghost)
    setLongRun(false); // the 10-day rules: the switch off reads every record's day as at most 10
    setEndless(false); // BUMP-1E: ... and so does endless off: with it on (the shipped value) the store reads rules bb-0.12.0 as endless and keeps day 12 on Tigris too (was setLongRun(false) alone)
    try {
      const at12 = await app.store.bucket(RULES_VERSION, 12);
      if (backend.name === "tigris") expect(at12).toEqual([]);
      else expect(at12.map((e) => e.id)).toEqual([id12]);
    } finally {
      setLongRun(true);
      setEndless(ENDLESS); // BUMP-1E: the shipped value back (on)
    }
  });

  it("the day bound follows the request's rules: 25 is taken, 26 is refused (400), older rules keep 10", async () => {
    expect((await get(25)).status).toBe(200);
    expect((await get(26)).status).toBe(400);
    expect((await get(11, { rules: "bb-0.9.7", lives: "5" })).status).toBe(400);
    expect((await get(10, { rules: "bb-0.9.7", lives: "5" })).status).toBe(404); // older rules: no widening, and no ghost of theirs
  });

  it("the client takes the earlier-day ghost as the server's (checked at its own day), and falls back to a stand-in for the exact day", async () => {
    const req = (day: number) => ({ rules: RULES_VERSION, day, wins: 9, lives: 10, playerId: "p-someone-else", seen: [] as string[], runs: 5, hero: "furnace" as const, seed: 3 });
    const fetched = await fetchGhost(base, req(14), 5000);
    expect([fetched.source, fetched.snapshot.day, fetched.error]).toEqual(["server", 12, undefined]);
    const none = await fetchGhost(base, req(5), 5000);
    expect(none.source).toBe("fallback");
    expect(none.snapshot.day).toBe(5); // the stand-in is built for the exact day
    const deep = await fetchGhost(base, req(40), 5000); // a run past the data bound keeps playing: its request is refused (400), its stand-in is not
    expect(deep.source).toBe("fallback");
    expect(deep.snapshot.day).toBe(25);
  }, 60_000);
});
