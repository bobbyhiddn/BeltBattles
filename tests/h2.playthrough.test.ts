// 0.8.0 H2 M1 (REQ-BFG-009, REQ-BFG-016; backlog 325): the game's own uploads always carry a record POST /v1/ghosts
// takes. Real runs through the run code, to day 10 or the run's end, for each of the four PLAYABLE_HEROES:
//  - the dawn: today's rune (FLIP-X2, cap's ruling 5d6d83ef57d1494c: an upload holds exactly one rune a dawn), taken as
//    the picker takes it (pendingRune, takeRune; the first card, as src/tooling.ts playOut). The runs skipped it before,
//    so every dusk deck held none, which validateUpload's exact count now refuses;
//  - the caravan: a few buys of offers the purse affords (buyOffer: supplies on the spot, parts to cargo, a twin merges);
//  - the fork: a random road pick (the event or one of the three warlords; none is blocked while the road is open);
//  - the event: a random choice among the unblocked ones (choicesFor / pickChoice), the DOCK's PATCH UP included;
//    a warlord fight: a random result (finishWarlord), and a random part on a Hard win (takePart);
//  - the dusk: startDusk, then the snapshot the game uploads (ghostOf, as src/game/online.ts submitDusk takes it, signed
//    under the device's playerId), then a random result: win, loss or draw (finishDay). Each run draws its own odds, so
//    long winning, losing and drawing streaks all happen.
// At every dusk the snapshot's record must pass isReachable, and the deck validateUpload (the game uploads only then).
// Every reachable record of every dusk 1-10 must be met at least once. Then one snapshot per record met (all four heroes
// among them) goes up, signed, to the in-process server on both stores: 201 each.
// Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE is the game's rule. A run that loses to 1 life before day 10 has a pending
// LAST CHANCE pick at the next dawn: the dawn's rune waits for it (pendingRune is null) and FIGHT is refused until a card is
// taken (run.ts fightRefusal), so the runs take it first, as the picker does (takeLastChance; a card the offer holds, drawn
// from the run's own stream, so all three cards are played). Each dusk is checked with POST's own calls (server/app.ts):
// validateUpload with the snapshot's seed and its lastChance, isReachable with its LAST CHANCE day (null when it has none).
// The record model now gives 172 records over dusks 1-10 (was 178), 13 of them only after a LAST CHANCE; the sample goes up
// as the game uploads it, with its lastChance.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { Rng, hashSeed } from "../src/core/rng";
import { RULES_VERSION, START_LIVES, type HeroId } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import type { SideStats } from "../src/sim/battle";
import { buyOffer, fightRefusal, newRun, pendingLastChance, pendingRune, takeLastChance, takeRune, type Run } from "../src/game/run";
import { BOONS, offeredId } from "../src/sim/lastChance"; // Z-BUMP (REQ-BFG-073): LAST CHANCE's pick
import { finishWarlord, leaveCaravan, pickPending, pickRoad, ROAD_PICKS, takePart, todaysWarlord } from "../src/game/road";
import { choicesFor, eventFor, pickChoice } from "../src/game/events";
import { finishDay, ghostOf, startDusk } from "../src/game/day";
import { fightBlock } from "../src/game/routeCheck";
import { isReachable, reachableRecords } from "../src/net/records";
import { encodeSnapshot, ghostId, MAX_DAY, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import { storeBackends } from "./netStores";
import { signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { setPlayerName } from "../src/game/ghostSnapshot";

setPlayerName(TEST_NAME); // PACKS M2 (REQ-BFG-063): the device has a player name, so ghostOf carries it as the game uploads it

// 400 runs a hero meet every reachable record by run 117 of each hero (output-H2/logs/m1-playcurve.json); ~7 s in all
const RUNS_PER_HERO = 400;
const NOSTATS = {} as SideStats; // finishDay and finishWarlord only store a fight's stats
const key = (day: number, wins: number, lives: number) => `${day}|${wins}|${lives}`;

interface Played {
  snaps: GhostSnapshot[]; // every dusk's upload, in order
  unreachable: string[]; // dusks whose record isReachable refuses (must stay empty)
  refused: string[]; // dusks whose deck validateUpload refuses (the game would not upload them)
  patchUps: number; // PATCH UPs bought (the DOCK's lives choice)
  dockMet: number; // days the road event was the DOCK
  refunds: number; // early-loss refunds given at dawn 3
  lastChance: string | null; // Z-BUMP: the LAST CHANCE card the run took (null: it never fired)
  lastDay: number;
  over: Run["over"];
}

/** One run of `hero` (run `i`), every snapshot signed as `player` uploads it. */
function playRun(hero: HeroId, i: number, player: string): Played {
  const rng = new Rng(hashSeed("h2-playthrough", hero, i));
  const run = newRun(hero, hashSeed("h2-run", hero, i), `h2-${hero}-${i}`);
  // this run's dusk odds (win, loss, draw): each may be 0, so streaks of every kind happen
  const odds = [rng.chance(0.2) ? 0 : rng.next(), rng.chance(0.2) ? 0 : rng.next(), rng.chance(0.3) ? 0 : rng.next() * 0.7];
  if (odds.every((o) => o === 0)) odds[0] = 1;
  const out: Played = { snaps: [], unreachable: [], refused: [], patchUps: 0, dockMet: 0, refunds: 0, lastChance: null, lastDay: 1, over: null };
  while (!run.over) {
    // Z-BUMP (the flip): a pending LAST CHANCE comes before the dawn's rune, as the picker requires (pendingRune waits for it
    // and FIGHT is refused while it is pending): a card its offer holds, drawn from this run's stream
    const lc = pendingLastChance(run);
    if (lc) {
      const boon = rng.pick(BOONS.filter((b) => offeredId(lc, b) !== null));
      expect(takeLastChance(run, boon).ok, `${hero} #${i} dawn ${run.day}: LAST CHANCE ${boon}`).toBe(true);
      out.lastChance = boon;
    }
    // FLIP-X2: the dawn's rune first (the first card: it draws nothing from this run's stream), as a run must before its
    // dusk (run.ts fightRefusal); a dawn-gold rune's gold is the caravan's
    const offer = pendingRune(run);
    if (offer) expect(takeRune(run, offer.ids[0]).ok, `${hero} #${i} dawn ${run.day}`).toBe(true);
    // the caravan: up to three buys the purse affords
    for (let t = rng.int(4); t > 0; t--) {
      const open = run.shop.wagons.flatMap((w, wi) => w.offers.map((o, si) => ({ o, wi, si }))).filter(({ o }) => !o.sold && o.price <= run.gold);
      if (!open.length) break;
      const { wi, si } = rng.pick(open);
      buyOffer(run, wi, si);
    }
    leaveCaravan(run);
    // the fork, then the road stop
    const pick = rng.pick(ROAD_PICKS);
    expect(pickRoad(run, pick).ok, `${hero} #${i} day ${run.day} ${pick}`).toBe(true);
    if (pick === "event") {
      if (eventFor(run.seed, run.day) === "dock") out.dockMet++;
      const open = choicesFor(run).map((c, ci) => ({ c, ci })).filter(({ c }) => !c.blocked);
      if (open.length) {
        const { c, ci } = rng.pick(open);
        const before = run.lives;
        expect(pickChoice(run, ci).ok).toBe(true);
        if (c.gain.some((d) => d.k === "lives")) {
          out.patchUps++;
          expect(run.lives).toBe(before + 1);
        } else expect(run.lives).toBe(before); // no other choice moves lives
      }
    } else {
      const before = run.lives;
      finishWarlord(run, rng.pick([0, 1, -1] as const), 20 + run.day);
      if (pickPending(run.warlord)) takePart(run, rng.int(todaysWarlord(run)!.result!.parts.length));
      expect(run.lives).toBe(before); // warlords never move lives
    }
    expect(fightBlock(run.build), `${hero} #${i} day ${run.day}: FIGHT open`).toBeFalsy(); // nothing here draws a belt
    expect(fightRefusal(run), `${hero} #${i} day ${run.day}: no pick pending`).toBeNull(); // Z-BUMP: FIGHT's own refusal
    // the dusk: the snapshot the game uploads as the dusk starts, then the fight's result
    startDusk(run, []);
    const s = ghostOf(run, 1_790_300_000_000 + i * 100 + run.day, player);
    out.snaps.push(s);
    // Z-BUMP (the flip): POST's own calls (server/app.ts): the record with the snapshot's LAST CHANCE day (null: none), the
    // deck with its seed and its lastChance. Were isReachable(s.day, s.wins, s.lives) and validateUpload(s.build, s.day)
    const lcAt = s.lastChance ? ` (LAST CHANCE ${s.lastChance.day})` : "";
    if (!isReachable(s.day, s.wins, s.lives, { lastChance: s.lastChance?.day ?? null })) out.unreachable.push(`${hero} #${i} d${s.day} ${s.wins}W ${s.lives}L${lcAt}`);
    const v = validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}) });
    if (!v.ok) out.refused.push(`${hero} #${i} d${s.day}${lcAt}: ${v.errors[0]}`);
    out.lastDay = run.day;
    const r = rng.next() * (odds[0] + odds[1] + odds[2]);
    const winner = r < odds[0] ? 0 : r < odds[0] + odds[1] ? 1 : -1;
    const res = finishDay(run, winner, 20 + run.day, NOSTATS, NOSTATS);
    if (res.refund) out.refunds++;
  }
  out.over = run.over;
  return out;
}

describe("H2: real runs through the run code only ever upload records POST /v1/ghosts takes", () => {
  let me: Identity;
  const runs: Played[] = [];
  const met = new Map<string, Map<HeroId, GhostSnapshot>>(); // each (day, wins, lives) met: each hero's first snapshot
  const sample: GhostSnapshot[] = []; // one snapshot per record met, the heroes in turn where they met it
  const t0 = performance.now();
  beforeAll(async () => {
    me = await testIdentity(3);
    for (const hero of PLAYABLE_HEROES) for (let i = 0; i < RUNS_PER_HERO; i++) runs.push(playRun(hero, i, me.playerId));
    for (const p of runs) {
      for (const s of p.snaps) {
        const by = met.get(key(s.day, s.wins, s.lives)) ?? new Map<HeroId, GhostSnapshot>();
        if (!by.has(s.hero)) by.set(s.hero, s);
        met.set(key(s.day, s.wins, s.lives), by);
      }
    }
    [...met.keys()].sort().forEach((k, j) => {
      const by = met.get(k)!;
      sample.push(by.get(PLAYABLE_HEROES[j % PLAYABLE_HEROES.length]) ?? [...by.values()][0]);
    });
  }, 60_000);

  it(`${RUNS_PER_HERO} runs of each of the four heroes: every dusk's snapshot carries a reachable record and an upload-valid deck`, () => {
    const dusks = runs.reduce((a, p) => a + p.snaps.length, 0);
    const summary = {
      runs: runs.length, dusks, ms: Math.round(performance.now() - t0),
      complete: runs.filter((p) => p.over === "complete").length, lost: runs.filter((p) => p.over === "lost").length,
      patchUps: runs.reduce((a, p) => a + p.patchUps, 0), dockMet: runs.reduce((a, p) => a + p.dockMet, 0),
      refunds: runs.reduce((a, p) => a + p.refunds, 0),
      // Z-BUMP: the runs that took each LAST CHANCE card
      lastChance: Object.fromEntries(BOONS.map((b) => [b, runs.filter((p) => p.lastChance === b).length])),
      perHero: Object.fromEntries(PLAYABLE_HEROES.map((h) => [h, runs.filter((p) => p.snaps[0].hero === h).length])),
      recordsMet: met.size, samplePerHero: Object.fromEntries(PLAYABLE_HEROES.map((h) => [h, sample.filter((s) => s.hero === h).length])),
      lastDay: Object.fromEntries(Array.from({ length: MAX_DAY }, (_, d) => [d + 1, runs.filter((p) => p.lastDay === d + 1).length])),
    };
    if (process.env.H2_PLAY_OUT) writeFileSync(process.env.H2_PLAY_OUT, JSON.stringify(summary, null, 1) + "\n");
    expect(runs.flatMap((p) => p.unreachable)).toEqual([]);
    expect(runs.flatMap((p) => p.refused)).toEqual([]);
    expect(summary.perHero).toEqual(Object.fromEntries(PLAYABLE_HEROES.map((h) => [h, RUNS_PER_HERO])));
    expect(summary.complete).toBeGreaterThan(0);
    expect(summary.lost).toBeGreaterThan(0);
    expect(summary.patchUps).toBeGreaterThan(0); // the DOCK's PATCH UP was bought
    expect(summary.refunds).toBeGreaterThan(0); // the early-loss refund was given
    for (const b of BOONS) expect(summary.lastChance[b], `LAST CHANCE ${b}`).toBeGreaterThan(0); // Z-BUMP: each card was taken
    for (const p of runs) expect(p.snaps[0]).toMatchObject({ rules: RULES_VERSION, day: 1, wins: 0, lives: START_LIVES });
  });

  // Z-BUMP (the flip): 172 (was 178): the record model with LAST CHANCE (reachableRecords: either, with or without one)
  it("they meet every reachable record of every dusk 1-10 (172), each at least once", () => {
    const missing: string[] = [];
    for (let day = 1; day <= MAX_DAY; day++) {
      for (const { wins, lives } of reachableRecords(day)) if (!met.has(key(day, wins, lives))) missing.push(`d${day} ${wins}W ${lives}L`);
    }
    expect(missing).toEqual([]);
    expect(met.size).toBe(172);
    expect(sample).toHaveLength(172);
    const perHero = Object.fromEntries(PLAYABLE_HEROES.map((h) => [h, sample.filter((s) => s.hero === h).length]));
    for (const h of PLAYABLE_HEROES) expect(perHero[h], `${h} in the sample`).toBeGreaterThanOrEqual(30);
    // Z-BUMP: 13 of them only a run that had its LAST CHANCE carries (1 life at dusks 7-10): their snapshots carry it
    const lcOnly = sample.filter((s) => !isReachable(s.day, s.wins, s.lives, { lastChance: null }));
    expect(lcOnly.map((s) => `d${s.day} ${s.wins}W ${s.lives}L`)).toEqual([
      "d10 0W 1L", "d10 1W 1L", "d10 2W 1L", "d10 3W 1L", "d10 4W 1L", "d7 0W 1L", "d8 0W 1L", "d8 1W 1L", "d8 2W 1L",
      "d9 0W 1L", "d9 1W 1L", "d9 2W 1L", "d9 3W 1L",
    ]);
    for (const s of lcOnly) expect(s.lastChance, `d${s.day} ${s.wins}W ${s.lives}L`).toBeDefined();
  });

  describe.each(storeBackends())("posted to the in-process server on the $name store (uploads open)", (backend) => {
    let app: GhostServer, base: string;
    beforeAll(async () => {
      await backend.setup();
      app = backend.server({ uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 } });
      base = `http://127.0.0.1:${await app.listen(0)}`;
    });
    afterAll(async () => {
      await app.close();
      await backend.teardown();
    });

    // Z-BUMP (the flip): 172 (was 178); each snapshot goes up as the game uploads it, with its lastChance where it has one
    it("one snapshot per record met (172, all four heroes), signed as the game signs them: 201 each, all stored", async () => {
      expect(sample).toHaveLength(172);
      for (const s of sample) {
        const body = encodeSnapshot(s);
        const lc = s.lastChance ? ` LAST CHANCE ${s.lastChance.day} ${s.lastChance.boon}` : "";
        const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
        expect([r.status, await r.json()], `${s.hero} d${s.day} ${s.wins}W ${s.lives}L${lc}`).toEqual([201, { id: ghostId(s) }]);
      }
      expect(backend.storedRecords()).toBe(172);
      expect(app.store.size).toBe(172);
    }, 60_000);
  });
});
