// NPC-1 (REQ-BFG-077, REQ-BFG-078): the server's check of the road log (src/net/snapshot.ts roadField, rulesGate.ts
// npcDayGateProblem, validate.ts roadProblem and the drops in the budget, roadCap.ts's NPC day, server/app.ts). Honest runs
// are the game's own rules played day by day (fork, fight, event, REFIT, dusk) with the switch on, snapshotted by day.ts
// ghostOf; each forgery is refused with its own line. Every test that turns NPC_DAY on puts it back (afterEach). The
// server's data dir is under os.tmpdir() (run with TMPDIR set).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SideStats } from "../src/sim/battle";
import { HEROES, ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { dropPool, npcDayRules, roadDropValue, setNpcDay, type RoadEntry } from "../src/sim/npcDay";
import { DIFFICULTIES, MATRIARCH_DAY, warlordOffer, type Difficulty } from "../src/sim/rivals";
import { choicesFor, pickChoice } from "../src/game/events";
import { finishDay, ghostOf } from "../src/game/day";
import { forkPicks, finishWarlord, leaveCaravan, onToTheRoad, pickRoad, topParts, warlordDeck, warlordDrop, warlordReward } from "../src/game/road";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { checkSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { heroGateProblem } from "../src/net/rulesGate";
import { roadProblem, validateUpload } from "../src/net/validate";
import { MODELLED_PICKS, MODELLED_REWARD_FIELDS, checkRoadModel, explainRoadCap, roadCap } from "../src/net/roadCap";
import { submitGhost } from "../src/net/ghostClient";
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { driveRuns } from "./uploadDriver";

const Z: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
const HEROS = (Object.keys(HEROES) as HeroId[]).filter((h) => heroGateProblem(RULES_VERSION, h) === null);
const PLATE = ITEMS.plating.supply!.hull!;

afterEach(() => setNpcDay(false));

/** An honest run with the switch on: `days` NPC days through the game's rules (each dawn's first rune, the fork's `tier`,
 *  the fight's `fight` outcome, the event's first open choice, REFIT, a dusk win), snapshotted at the last dusk. */
function honest(hero: HeroId, seed: number, days: number, tier: Difficulty | ((d: number) => Difficulty), fight: 0 | 1 = 0): GhostSnapshot {
  setNpcDay(true);
  const run: Run = newRun(hero, seed, `npc1-${hero}-${seed}`);
  let snap: GhostSnapshot | null = null;
  for (let d = 1; d <= days; d++) {
    const o = pendingRune(run);
    if (o) takeRune(run, o.ids[0]);
    leaveCaravan(run);
    expect(pickRoad(run, typeof tier === "function" ? tier(d) : tier).ok).toBe(true);
    finishWarlord(run, fight, 20);
    onToTheRoad(run);
    const i = choicesFor(run).findIndex((c) => !c.blocked);
    if (i >= 0) pickChoice(run, i);
    onToTheRoad(run);
    leaveCaravan(run);
    snap = ghostOf(run, 1_790_000_000_000, "p-npc1", null);
    if (d < days) finishDay(run, 0, 30, { ...Z }, { ...Z });
  }
  return snap!;
}

const check = (s: GhostSnapshot) => validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.road ? { road: s.road } : {}) });

/** The first win of `s` whose seeded roll gave a part from a pool of at least two (a part to swap for a forgery). */
function swappable(s: GhostSnapshot): { i: number; other: string } {
  for (const [i, e] of s.road!.entries()) {
    if (e.outcome !== "win" || !e.drop) continue;
    const id = warlordOffer(s.seed!, e.day)[e.tier];
    if (id === "matriarch") continue;
    const other = dropPool(warlordDeck(id, e.day)).find((d) => d !== e.drop);
    if (other) return { i, other };
  }
  throw new Error("no swappable drop");
}

describe("NPC-1: the decoder and the gate (snapshot.road)", () => {
  it("with the switch off the field is refused (the endpoint's 400), and validateUpload refuses it too", () => {
    const s = honest("furnace", 11, 3, "medium");
    expect(s.road!.length).toBe(3);
    setNpcDay(false);
    expect(() => checkSnapshot(s)).toThrow("snapshot.road: not in this rules version yet");
    expect(isSnapshot(s)).toBe(false);
    expect(check(s).errors).toEqual(["road: not in this rules version yet"]);
    const { road: _, ...bare } = s;
    expect(check(bare as GhostSnapshot).ok).toBe(true); // the same deck without the field: as before
  });

  it("with the switch on it round-trips, last of all; malformed entries are refused", () => {
    const s = honest("weaver", 12, 4, "hard");
    setNpcDay(true);
    const c = checkSnapshot(JSON.parse(JSON.stringify(s)));
    expect(c.road).toEqual(s.road);
    expect(Object.keys(c).pop()).toBe("road");
    expect(isSnapshot(c)).toBe(true);
    for (const bad of [
      [{ day: 1, tier: "boss", outcome: "win" }], [{ day: 1, tier: "easy", outcome: "won" }], [{ day: 0, tier: "easy", outcome: "win" }],
      [{ day: 1, tier: "easy", outcome: "win", drop: "Not A Part!" }], [{ day: 1, tier: "easy", outcome: "win", extra: 1 }], { day: 1 },
    ]) expect(() => checkSnapshot({ ...s, road: bad }), JSON.stringify(bad)).toThrow(/snapshot\.road/);
  });
});

describe("NPC-1: honest runs are accepted (REQ-BFG-078)", () => {
  it("every hero, each tier, with drops (wins) and without (losses), day 1 to 10", () => {
    let withDrops = 0;
    for (const hero of HEROS) {
      for (const tier of DIFFICULTIES) {
        for (const [fight, days] of [[0, 4], [1, 3], [0, 10]] as const) {
          const s = honest(hero, 100 + hero.length * 7 + days, days, tier, fight);
          expect(s.road!.length).toBe(days);
          if (fight === 1) expect(s.road!.every((e) => e.drop === undefined)).toBe(true);
          withDrops += s.road!.filter((e) => e.drop).length;
          const v = check(s);
          expect(v.errors, `${hero} ${tier} ${fight} d${days}`).toEqual([]);
        }
      }
    }
    expect(withDrops).toBeGreaterThan(50);
  });

  it("the upload driver's honest runs (tests/uploadDriver.ts on the NPC day: fight, event, REFIT; bought decks) all pass", () => {
    setNpcDay(true);
    let n = 0, drops = 0;
    for (const policy of ["mixed", "warlord:hard", "event:dice:BET 6|warlord:hard"] as const) {
      for (const r of driveRuns(policy === "mixed" ? 12 : 4, 8100, HEROS, policy)) { // the heroes bb-0.9.7 takes
        for (const d of r.dusks) {
          expect(d.roadLog!.length, `${d.hero} d${d.day}`).toBe(d.day);
          const v = validateUpload(d.build, d.day, RULES_VERSION, { seed: d.runSeed, road: d.roadLog });
          expect(v.errors, `${policy} ${d.hero} seed ${d.seed} d${d.day}: ${d.road}`).toEqual([]);
          n++;
          drops += d.roadLog!.filter((e) => e.drop).length;
        }
      }
    }
    expect(n).toBeGreaterThan(150);
    expect(drops).toBeGreaterThan(100);
  });

  it("the Matriarch's run: her legendary part on her win, and a mixed run of tiers", () => {
    const s = honest("furnace", 4040, 10, (d) => (d >= MATRIARCH_DAY ? "hard" : (["easy", "medium", "hard"] as const)[d % 3]));
    const queen = s.road!.find((e) => e.day === MATRIARCH_DAY)!;
    expect(queen.drop).toBe(topParts(warlordDeck("matriarch", MATRIARCH_DAY), 1)[0]);
    expect(ITEMS[queen.drop!].rarity).toBe("legendary");
    expect(check(s).errors).toEqual([]);
  });

  it("the drops count toward the budget at their value: a deck at its edge needs them", () => {
    const s = honest("furnace", 77, 6, "hard");
    const value = roadDropValue(s.road);
    expect(value).toBeGreaterThan(ITEMS.plating.price);
    const at = (k: number, road = true): GhostSnapshot => ({ ...s, ...(road ? {} : { road: undefined }), build: { ...s.build, hullBonus: s.build.hullBonus + k * PLATE } });
    let k = 0;
    while (k < 400 && check(at(k + 1)).ok) k++;
    expect(check(at(k)).ok).toBe(true);
    const without = check({ ...at(k), road: undefined });
    expect(without.ok).toBe(false); // without the log the same deck is over budget
    expect(check(at(k + 1)).errors.join(" ")).toContain(`+ drops ${value}`);
  });
});

describe("NPC-1: forgeries are refused, each with its own line (REQ-BFG-078)", () => {
  it("a drop the seeded roll didn't give; a part not in that warlord's pool; a drop on a loss", () => {
    const s = honest("furnace", 5150, 6, "medium");
    setNpcDay(true);
    const { i, other } = swappable(s);
    const e = s.road![i];
    const forged = s.road!.map((x, j) => (j === i ? { ...x, drop: other } : x));
    expect(check({ ...s, road: forged }).errors[0]).toMatch(new RegExp(`^road: day ${e.day}: the seeded roll of .+ gave ${e.drop}, not ${other}$`));
    const none = s.road!.map((x, j) => (j === i ? { day: x.day, tier: x.tier, outcome: x.outcome } : x));
    expect(check({ ...s, road: none }).errors[0]).toMatch(new RegExp(`^road: day ${e.day}: the seeded roll of .+ gave ${e.drop}, not no drop$`));
    const id = warlordOffer(s.seed!, e.day)[e.tier];
    const outside = Object.keys(ITEMS).find((d) => ITEMS[d].kind === "gate" && ITEMS[d].rarity === "common" && !dropPool(warlordDeck(id, e.day)).includes(d) && !dropPool(warlordDeck(id, e.day, true)).includes(d))!;
    const notPool = s.road!.map((x, j) => (j === i ? { ...x, drop: outside } : x));
    expect(check({ ...s, road: notPool }).errors[0]).toMatch(new RegExp(`^road: day ${e.day}: ${outside} is not in .+'s pool$`));
    const loss = s.road!.map((x, j) => (j === i ? { ...x, outcome: "loss" as const } : x));
    expect(check({ ...s, road: loss }).errors).toEqual([`road: day ${e.day}: a drop (${e.drop}) on a loss`]);
  });

  it("two entries for one day; an entry for a day the snapshot hasn't reached", () => {
    const s = honest("weaver", 6160, 5, "easy");
    setNpcDay(true);
    expect(check({ ...s, road: [...s.road!, { ...s.road![2] }] }).errors).toEqual(["road: two entries for day 3"]);
    expect(check({ ...s, road: [...s.road!, { day: 6, tier: "easy", outcome: "loss" }] }).errors).toEqual(["road: day 6 is past the deck's day 5"]);
  });

  it("a second Matriarch part", () => {
    const s = honest("furnace", 4040, 10, (d) => (d >= MATRIARCH_DAY ? "hard" : "medium"));
    setNpcDay(true);
    const part = topParts(warlordDeck("matriarch", MATRIARCH_DAY), 1)[0];
    const second = s.road!.map((x) => (x.day === MATRIARCH_DAY + 1 ? { ...x, outcome: "win" as const, drop: part } : x));
    expect(check({ ...s, road: second }).errors).toEqual([`road: day ${MATRIARCH_DAY + 1}: ${part} is a second Matriarch part (a legendary part is hers alone, paid once at her win)`]);
    // and roadProblem alone, without a deck (the function the server asks)
    expect(roadProblem(second, 10, s.seed)).toContain("second Matriarch part");
    expect(roadProblem(s.road!, 10, s.seed)).toBeNull();
  });
});

describe("NPC-1: roadCap models a fight and the day's event every day (D4 kept honest)", () => {
  it("every pick and reward field under the switch is reviewed; off and on don't share a memo", () => {
    const off = [1, 3, 5, 8, 10].map((d) => roadCap(d));
    setNpcDay(true);
    expect(forkPicks().every((p) => MODELLED_PICKS.includes(p))).toBe(true);
    for (const t of DIFFICULTIES) for (const k of Object.keys(warlordReward(warlordOffer(1, 1)[t], t, warlordDeck(warlordOffer(1, 1)[t], 1), 1))) expect(MODELLED_REWARD_FIELDS).toContain(k);
    expect(() => checkRoadModel()).not.toThrow();
    const on = [1, 3, 5, 8, 10].map((d) => roadCap(d));
    for (const v of on) expect(Number.isFinite(v)).toBe(true);
    // each day of the best plan is a fight, then (maybe) one event; each event at most once
    const plan = explainRoadCap(10);
    expect(plan.length).toBe(10);
    const events: string[] = [];
    for (const p of plan) {
      expect(p.pick).toMatch(/^(easy\/medium \(or a lost fight\)|hard( \+ bounty)?|matriarch( \+ bounty)?)(, then event [a-z]+: .+)?$/);
      const m = /then event ([a-z]+):/.exec(p.pick);
      if (m) events.push(m[1]);
    }
    expect(new Set(events).size).toBe(events.length);
    setNpcDay(false);
    expect([1, 3, 5, 8, 10].map((d) => roadCap(d))).toEqual(off);
    expect(npcDayRules()).toBe(false);
  });
});

describe("NPC-1: end to end through the server", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-npc1-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("POST /v1/ghosts: 201 for an honest run, 422 for a forged road, 400 for the field with the switch off", async () => {
    const me = await testIdentity(0);
    const s = honest("weaver", 7070, 5, "hard");
    setNpcDay(true);
    const res = await submitGhost(base, ownedBy(s, me), me, 5000);
    expect(res, JSON.stringify(res)).toMatchObject({ ok: true });
    expect(app.store.size).toBe(1);
    const { i, other } = swappable(s);
    const body = JSON.stringify(ownedBy({ ...s, runId: "npc1-forged", road: s.road!.map((x, j) => (j === i ? { ...x, drop: other } : x)) }, me));
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    expect(r.status).toBe(422);
    expect(JSON.stringify(await r.json())).toContain(`not ${other}`);
    setNpcDay(false);
    const off = JSON.stringify(ownedBy({ ...s, runId: "npc1-off" }, me));
    const q = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, off), body: off });
    expect(q.status).toBe(400);
    expect(JSON.stringify(await q.json())).toContain("snapshot.road: not in this rules version yet");
    expect(app.store.size).toBe(1);
  });
});
