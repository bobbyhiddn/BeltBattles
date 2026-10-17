// PROFILE-UP step 1 (REQ-BFG-074 clause 4, backlog #371; BRIEF-PROFILEUP P3, P4, P5): the profile's wire form as pure code.
// The canonical form and its byte limit, the strict decode (400, and 422 for a newer version), each plausibility cap
// (422, naming the field), the honest-profile cases that the study's caps would have refused, the fold relations driven by
// profile.ts's real fold code at random, and the merge properties (commutative, associative, idempotent; chosen follows
// the newer) on random valid profiles.
import { describe, expect, it } from "vitest";
import {
  SEED_GHOST_KEY, SEED_RUNS_KEY, SEED_SAVE_KEY, emptyProfile, evaluateUnlocks, foldDusk, foldEnd, foldWarlord, seedProfile, wear, type Profile, type RunFacts,
} from "../src/game/profile";
import { flawless } from "../src/game/day";
import type { Run } from "../src/game/run";
import { DEFAULT_SKIN, SURFACES, stylesOf, styleKey, type Surface } from "../src/render/styles";
import { HEROES, RUN_DAYS } from "../src/sim/content";
import {
  COUNTER_KEYS, EARLIEST_UPDATED_AT, MAX_BEST_DAY, MAX_COUNT, MAX_MOST_BELTS, MAX_PROFILE_BYTES, ProfileWireError, UPDATED_AT_AHEAD_MS,
  WIRE_V, checkWire, counterCeiling, decodeWire, encodeWire, mergeWire, toWire, type WireProfile,
} from "../src/net/profileWire";
import { HERO_LIST, NOW, bodyOf, earnedWire, freshWire, maximalWire, randomWire, rng, type Rng } from "./profileupWire";

const GOLDEN = '{"v":1,"counters":{"runs":0,"runsFinished":0,"flawless":0,"duskWins":0,"bestDay":0,"warlordWins":0,"matriarchWins":0,"mostBelts":0},"heroesWon":[],"heroesFinished":[],"unlocked":[],"chosen":{"floor":"plate","belt":"iron","panel":"slate","carrier":"war"},"updatedAt":1790000000000}';

/** The error a call throws, or null. */
function refusal(f: () => unknown): ProfileWireError | null {
  try {
    f();
    return null;
  } catch (e) {
    if (e instanceof ProfileWireError) return e;
    throw e;
  }
}

/** decodeWire(text) must be refused with `status` and a message that contains `field`. */
function refused(text: string, status: 400 | 422, field: string): void {
  const e = refusal(() => decodeWire(text));
  expect(e, `${field} in ${text.slice(0, 80)}`).not.toBeNull();
  expect(e!.status).toBe(status);
  expect(e!.message).toContain(field);
}

/** checkWire(w) must be refused with a 422 naming `field`. */
function capped(w: WireProfile, field: string): void {
  const e = refusal(() => checkWire(w, NOW));
  expect(e, field).not.toBeNull();
  expect(e!.status).toBe(422);
  expect(e!.message).toContain(field);
}

const withCounters = (c: Partial<WireProfile["counters"]>, base: WireProfile = freshWire()): WireProfile => ({ ...base, counters: { ...base.counters, ...c } });
const edit = (w: WireProfile, f: (o: Record<string, unknown>) => void): string => {
  const o = JSON.parse(encodeWire(w)) as Record<string, unknown>;
  f(o);
  return JSON.stringify(o);
};

describe("the canonical form", () => {
  it("pins: the wire version, the counter order, the byte limit", () => {
    expect(WIRE_V).toBe(1);
    expect(COUNTER_KEYS).toEqual(Object.keys(emptyProfile().counters)); // profile.ts's own order
    expect(SURFACES).toEqual(Object.keys(DEFAULT_SKIN)); // floor, belt, panel, carrier
    expect(MAX_PROFILE_BYTES).toBe(2048);
  });

  it("is exactly these keys in this order, no spaces: a golden body", () => {
    expect(encodeWire(freshWire())).toBe(GOLDEN);
    expect(decodeWire(GOLDEN)).toEqual(freshWire());
  });

  it("leaves out seen, folded and runNew, which stay on the device; and the key order does not depend on the profile's", () => {
    const p: Profile = emptyProfile();
    p.updatedAt = NOW;
    p.seen = ["style:floor.timber"];
    p.folded = ["r1:1", "r1:end"];
    p.runNew = { runId: "r1", ids: ["style:floor.timber"] };
    const text = encodeWire(toWire(p));
    expect(text).toBe(GOLDEN);
    for (const dropped of ["seen", "folded", "runNew", "r1"]) expect(text).not.toContain(dropped);
    expect(Object.keys(toWire(p))).toEqual(["v", "counters", "heroesWon", "heroesFinished", "unlocked", "chosen", "updatedAt"]);
  });

  it("sorts every set and drops duplicates, whatever order the device kept them in", () => {
    const p = emptyProfile();
    p.updatedAt = NOW;
    p.counters.duskWins = 3;
    p.counters.warlordWins = 1;
    p.heroesWon = ["weaver", "furnace", "weaver"];
    p.unlocked = ["style:floor.timber", "style:floor.checker", "style:floor.timber"];
    const w = toWire(p);
    expect(w.heroesWon).toEqual(["furnace", "weaver"]);
    expect(w.unlocked).toEqual(["style:floor.checker", "style:floor.timber"]); // both earned (3 dusk wins, 1 warlord), sorted once
  });

  it("the biggest profile the catalogue and the hero list can make is under 1 KB, so 2048 is the limit (not 4096)", () => {
    const w = maximalWire();
    expect(w.unlocked).toHaveLength(16); // every style: 4 surfaces x 4 earned
    expect(w.heroesWon).toHaveLength(Object.keys(HEROES).length);
    expect(() => checkWire(w, NOW)).not.toThrow(); // it is a profile the server accepts
    const bytes = bodyOf(w).length;
    console.log(`PROFILE-UP: the largest canonical profile today is ${bytes} bytes (${Object.keys(HEROES).length} heroes, ${w.unlocked.length} unlocks)`);
    expect(bytes).toBeLessThan(1024);
    expect(bytes).toBeLessThanOrEqual(MAX_PROFILE_BYTES / 2);
  });
});

describe("the strict decode: 400, and 422 for a newer version", () => {
  it("round-trips a profile with sets", () => {
    const w = earnedWire({ runs: 5, runsFinished: 2, duskWins: 9, bestDay: 6, warlordWins: 1 }, { won: ["weaver", "furnace"], finished: ["furnace"] });
    expect(decodeWire(encodeWire(w))).toEqual(w);
  });

  it("not JSON, not an object", () => {
    refused("", 400, "not JSON");
    refused("{", 400, "not JSON");
    refused("{}x", 400, "not JSON");
    for (const t of ["null", "1", '"a"', "[]", "true"]) refused(t, 400, "expected an object");
  });

  it("v: missing, zero, fractional, a string -> 400; a newer one -> 422, even with a body this server could not read", () => {
    refused(edit(freshWire(), (o) => delete o.v), 400, "v:");
    refused(edit(freshWire(), (o) => (o.v = 0)), 400, "v:");
    refused(edit(freshWire(), (o) => (o.v = 1.5)), 400, "v:");
    refused(edit(freshWire(), (o) => (o.v = "1")), 400, "v:");
    refused(edit(freshWire(), (o) => (o.v = 2)), 422, "newer than this server reads");
    refused(edit(freshWire(), (o) => { o.v = 7; o.extra = 1; delete o.counters; }), 422, "v: version 7");
    refused(edit(freshWire(), (o) => (o.v = 1e9)), 422, "v: version");
  });

  it("unknown fields (top level, counters, chosen) and missing fields", () => {
    refused(edit(freshWire(), (o) => (o.playerId = "x")), 400, "playerId: unknown field");
    refused(edit(freshWire(), (o) => (o.seen = [])), 400, "seen: unknown field");
    refused(edit(freshWire(), (o) => (o.folded = [])), 400, "folded: unknown field");
    refused(edit(freshWire(), (o) => (o.runNew = null)), 400, "runNew: unknown field");
    refused(edit(freshWire(), (o) => ((o.counters as Record<string, unknown>).extra = 0)), 400, "counters.extra: unknown field");
    refused(edit(freshWire(), (o) => ((o.chosen as Record<string, unknown>).hull = "war")), 400, "chosen.hull: unknown field");
    refused('{"__proto__":1,"v":1}', 400, "__proto__: unknown field"); // JSON.parse makes it an own key; it is not a field
    for (const k of ["counters", "heroesWon", "heroesFinished", "unlocked", "chosen", "updatedAt"]) {
      refused(edit(freshWire(), (o) => delete o[k]), 400, `${k}: missing`);
    }
    refused(edit(freshWire(), (o) => delete (o.counters as Record<string, unknown>).runs), 400, "counters.runs: missing");
    refused(edit(freshWire(), (o) => delete (o.chosen as Record<string, unknown>).carrier), 400, "chosen.carrier: missing");
  });

  it("wrong types, non-integers and negatives, in every counter and in updatedAt", () => {
    for (const k of COUNTER_KEYS) {
      for (const bad of [-1, 1.5, "3", null, true, [], {}, Number.MAX_SAFE_INTEGER + 2]) {
        refused(edit(freshWire(), (o) => ((o.counters as Record<string, unknown>)[k] = bad)), 400, `counters.${k}`);
      }
    }
    for (const bad of [-1, 0.5, "1", null, 2 ** 53]) refused(edit(freshWire(), (o) => (o.updatedAt = bad)), 400, "updatedAt");
    refused(edit(freshWire(), (o) => (o.counters = [])), 400, "counters: expected an object");
    refused(edit(freshWire(), (o) => (o.chosen = "plate")), 400, "chosen: expected an object");
    for (const s of SURFACES) refused(edit(freshWire(), (o) => ((o.chosen as Record<string, unknown>)[s] = 3)), 400, `chosen.${s}`);
  });

  it("sets: not a list, not strings, duplicates, not sorted", () => {
    for (const k of ["heroesWon", "heroesFinished", "unlocked"]) {
      refused(edit(freshWire(), (o) => (o[k] = "furnace")), 400, `${k}: expected a list`);
      refused(edit(freshWire(), (o) => (o[k] = [1])), 400, `${k}: expected a list of strings`);
      refused(edit(freshWire(), (o) => (o[k] = [null])), 400, `${k}: expected a list of strings`);
      refused(edit(freshWire(), (o) => (o[k] = ["furnace", "furnace"])), 400, `${k}: duplicate`);
      refused(edit(freshWire(), (o) => (o[k] = ["weaver", "furnace"])), 400, `${k}: not sorted`);
    }
  });

  it("only the canonical text decodes: spaces, another key order, 1e3, 1.0 and -0 are 400", () => {
    const w = earnedWire({ runs: 3, duskWins: 4 });
    const text = encodeWire(w);
    expect(decodeWire(text)).toEqual(w);
    refused(JSON.stringify(JSON.parse(text), null, 1), 400, "canonical");
    refused(text + " ", 400, "canonical");
    refused(text + "\n", 400, "canonical");
    refused(text.replace('"runs":3', '"runs":3.0'), 400, "canonical");
    refused(text.replace('"runs":3', '"runs":3e0'), 400, "canonical");
    refused(text.replace('"flawless":0', '"flawless":-0'), 400, "canonical");
    const o = JSON.parse(text) as Record<string, unknown>;
    const reordered = JSON.stringify({ updatedAt: o.updatedAt, ...o });
    refused(reordered, 400, "canonical");
    refused(text.replace('"floor":"plate","belt":"iron"', '"belt":"iron","floor":"plate"'), 400, "canonical");
  });
});

describe("the plausibility caps: 422, naming the field", () => {
  it("a fresh profile, and the largest one, pass", () => {
    expect(() => checkWire(freshWire(), NOW)).not.toThrow();
    expect(() => checkWire(maximalWire(), NOW)).not.toThrow();
  });

  it("each counter has an absolute ceiling, named with its reason; the ceiling itself passes, one over is a 422", () => {
    expect(MAX_BEST_DAY).toBe(999);
    expect(MAX_MOST_BELTS).toBe(999);
    expect(MAX_COUNT).toBe(1_000_000);
    for (const k of COUNTER_KEYS) {
      const max = counterCeiling(k);
      expect(max).toBe(k === "bestDay" ? 999 : k === "mostBelts" ? 999 : 1_000_000);
      // a ceiling alone: lift the counters a relation reads, so only the ceiling is under test
      const base = withCounters({ runs: MAX_COUNT, runsFinished: MAX_COUNT, warlordWins: MAX_COUNT });
      const e = refusal(() => checkWire(withCounters({ [k]: max + 1 }, { ...base, unlocked: [] }), NOW));
      expect(e?.status, k).toBe(422);
      expect(e?.message, k).toContain(`counters.${k}`);
      expect(e?.message, k).toContain("ceiling");
      // at the ceiling it is not the ceiling that refuses (unlocked is checked against the counters, so use all earned)
      expect(() => checkWire(earnedWire({ ...base.counters, [k]: max }), NOW), k).not.toThrow();
    }
  });

  it("the fold relations: runsFinished <= runs, flawless <= runs, matriarchWins <= warlordWins (each from one fold function)", () => {
    capped(earnedWire({ runs: 2, runsFinished: 3 }), "counters.runsFinished");
    capped(earnedWire({ runs: 2, runsFinished: 1, flawless: 3 }), "counters.flawless");
    capped(earnedWire({ warlordWins: 1, matriarchWins: 2 }), "counters.matriarchWins");
    for (const ok of [{ runs: 2, runsFinished: 2, flawless: 2 }, { warlordWins: 4, matriarchWins: 4 }, { runs: 0, runsFinished: 0 }]) {
      expect(() => checkWire(earnedWire(ok), NOW)).not.toThrow();
    }
  });

  it("flawless <= runsFinished is NOT asked: it holds at this base only through day.ts flawless(), which RUN-1 redefines, and a wrong relation would refuse every honest flawless player", () => {
    expect(() => checkWire(earnedWire({ runs: 5, runsFinished: 2, flawless: 3 }), NOW)).not.toThrow();
  });

  it("heroes are HEROES ids; a hero id the game does not have is a 422 in either list", () => {
    capped({ ...freshWire(), heroesWon: ["nobody"] }, "heroesWon");
    capped({ ...freshWire(), heroesFinished: ["constructor"] }, "heroesFinished");
    capped({ ...freshWire(), heroesWon: ["toString"] }, "heroesWon");
    for (const h of HERO_LIST) expect(() => checkWire({ ...freshWire(), heroesWon: [h], heroesFinished: [h] }, NOW)).not.toThrow();
  });

  it("unlocked: known style keys that the upload's own counters and hero lists earn", () => {
    capped({ ...freshWire(), unlocked: ["style:floor.nope"] }, "unlocked");
    capped({ ...freshWire(), unlocked: ["floor.timber"] }, "unlocked");
    capped({ ...freshWire(), unlocked: ["hero:furnace"] }, "unlocked");
    capped({ ...freshWire(), unlocked: ["style:floor.plate"] }, "not an unlockable style"); // a default is never unlocked
    capped({ ...freshWire(), unlocked: ["style:floor.timber"] }, "not earned"); // duskWins 0: timber needs 3
    capped({ ...earnedWire({ duskWins: 2 }), unlocked: ["style:floor.timber"] }, "not earned");
    expect(() => checkWire({ ...earnedWire({ duskWins: 3 }), unlocked: ["style:floor.timber"] }, NOW)).not.toThrow();
    // the hero lists count: TIMBER ROLLERS needs 2 different heroes who won
    capped({ ...freshWire(), unlocked: ["style:belt.timber"] }, "not earned");
    const won2 = earnedWire({}, { won: ["furnace", "weaver"] });
    expect(won2.unlocked).toContain("style:belt.timber");
    expect(() => checkWire(won2, NOW)).not.toThrow();
  });

  it("chosen: a known style that is its default or unlocked, on each surface", () => {
    for (const s of SURFACES) {
      capped({ ...freshWire(), chosen: { ...freshWire().chosen, [s]: "nope" } }, `chosen.${s}`);
      const locked = stylesOf(s).find((x) => x.counter)!;
      capped({ ...freshWire(), chosen: { ...freshWire().chosen, [s]: locked.id } }, `chosen.${s}`);
      const full = maximalWire();
      for (const x of stylesOf(s)) expect(() => checkWire({ ...full, chosen: { ...full.chosen, [s]: x.id } }, NOW)).not.toThrow();
    }
  });

  it("updatedAt: from 2026-01-01 to the server's now plus a day, both ends inclusive", () => {
    expect(EARLIEST_UPDATED_AT).toBe(Date.parse("2026-01-01T00:00:00Z"));
    expect(UPDATED_AT_AHEAD_MS).toBe(86_400_000);
    capped({ ...freshWire(), updatedAt: 0 }, "updatedAt");
    capped({ ...freshWire(), updatedAt: EARLIEST_UPDATED_AT - 1 }, "updatedAt");
    capped({ ...freshWire(), updatedAt: NOW + UPDATED_AT_AHEAD_MS + 1 }, "updatedAt");
    capped({ ...freshWire(), updatedAt: Number.MAX_SAFE_INTEGER }, "updatedAt");
    for (const t of [EARLIEST_UPDATED_AT, NOW, NOW + UPDATED_AT_AHEAD_MS]) expect(() => checkWire({ ...freshWire(), updatedAt: t }, NOW)).not.toThrow();
  });
});

describe("honest profiles under 1D's rules are never refused (RUN-1: no day cap; REQ-BFG-059: ENDLESS)", () => {
  it("the study's caps would refuse these; the real ones accept them", () => {
    expect(RUN_DAYS).toBe(10);
    // bestDay past RUN_DAYS: a run has no day cap, so day 25 is a day an honest run reaches
    for (const bestDay of [10, 11, 17, 25, 100, MAX_BEST_DAY]) {
      expect(() => checkWire(earnedWire({ runs: 1, bestDay }), NOW), `bestDay ${bestDay}`).not.toThrow();
    }
    // duskWins past 10 x runs: a run's wins pass 10 (ENDLESS), and a run in progress has folded dusks before it ends
    for (const [runs, duskWins] of [[1, 11], [1, 30], [0, 7], [3, 250], [2, 999]] as const) {
      expect(() => checkWire(earnedWire({ runs, duskWins, bestDay: 40 }), NOW), `${duskWins} wins in ${runs} runs`).not.toThrow();
    }
    // a new profile that has not finished a run, and one far along
    expect(() => checkWire(earnedWire({ runs: 40, runsFinished: 12, flawless: 2, duskWins: 230, bestDay: 31, warlordWins: 19, matriarchWins: 7, mostBelts: 9 }, { won: [...HERO_LIST], finished: HERO_LIST.slice(0, 4) }), NOW)).not.toThrow();
  });

  it("the decoder takes them from the wire as well", () => {
    const w = earnedWire({ runs: 2, duskWins: 31, bestDay: 24 }, { won: ["furnace"] });
    const back = decodeWire(encodeWire(w));
    checkWire(back, NOW);
    expect(back).toEqual(w);
  });
});

describe("the relations hold for what profile.ts's real folds make", () => {
  it("day.ts flawless(run) needs run.over === 'complete'; a lost or running 10-0 is not flawless (so flawless <= runsFinished holds at this base; the server asks only flawless <= runs)", () => {
    const run = (over: Run["over"], losses = 0, wins = RUN_DAYS) => ({ over, losses, wins }) as unknown as Run;
    expect(flawless(run("complete"))).toBe(true);
    expect(flawless(run("lost"))).toBe(false);
    expect(flawless(run(null))).toBe(false);
    expect(flawless(run("complete", 1))).toBe(false);
  });

  it("foldEnd: runs always, runsFinished and the hero only on 'complete', flawless only with the facts; foldWarlord: matriarch only inside a win", () => {
    const f = (o: Partial<RunFacts> = {}): RunFacts => ({ runId: "a", hero: "furnace", day: 3, over: null, flawless: false, belts: 2, ...o });
    let p = emptyProfile();
    foldEnd(p, f({ over: "lost" }));
    expect([p.counters.runs, p.counters.runsFinished, p.counters.flawless, p.heroesFinished.length]).toEqual([1, 0, 0, 0]);
    p = emptyProfile();
    foldEnd(p, f({ over: "complete", flawless: true }));
    expect([p.counters.runs, p.counters.runsFinished, p.counters.flawless, p.heroesFinished]).toEqual([1, 1, 1, ["furnace"]]);
    p = emptyProfile();
    foldWarlord(p, f(), 3, "loss", true);
    foldWarlord(p, f(), 4, "draw", true);
    expect([p.counters.warlordWins, p.counters.matriarchWins]).toEqual([0, 0]);
    foldWarlord(p, f(), 5, "win", true);
    expect([p.counters.warlordWins, p.counters.matriarchWins]).toEqual([1, 1]);
  });

  it("random run histories folded by the real code (RUN-1 shapes: any length, ENDLESS past 10 wins, abandons) always pass the caps", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const r = rng(seed);
      const p = emptyProfile();
      let stamp = EARLIEST_UPDATED_AT + 1;
      const runs = 1 + r.int(30);
      for (let n = 0; n < runs; n++) {
        const hero = r.pick(HERO_LIST), runId = `s${seed}r${n}`;
        const days = 1 + r.int(r.bool(0.15) ? 40 : 14);
        let losses = 0, wins = 0;
        for (let day = 1; day <= days; day++) {
          const out = r.pick(["win", "win", "loss", "draw"] as const);
          if (out === "win") wins++;
          if (out === "loss") losses++;
          const facts: RunFacts = { runId, hero, day: day + 1, over: null, flawless: false, belts: r.int(14) };
          foldDusk(p, facts, day, out);
          if (r.bool(0.25)) foldWarlord(p, facts, day, r.pick(["win", "loss", "draw"] as const), r.bool(0.3));
          if (r.bool(0.1)) foldDusk(p, facts, day, out); // a reload folds again: counted once
        }
        const over = r.pick(["complete", "lost", null] as const); // null: ABANDON
        foldEnd(p, { runId, hero, day: days + 1, over, flawless: over === "complete" && losses === 0 && wins >= 10 && r.bool(0.7), belts: r.int(14) });
        if (r.bool(0.4)) {
          const s = r.pick(SURFACES);
          const open = [DEFAULT_SKIN[s], ...p.unlocked.filter((k) => k.startsWith(`style:${s}.`)).map((k) => k.slice(`style:${s}.`.length))];
          wear(p, s, r.pick(open));
        }
        p.updatedAt = stamp += 1 + r.int(1_000_000);
        const w = toWire(p);
        expect(() => checkWire(w, NOW), `seed ${seed} run ${n}`).not.toThrow();
        expect(w.counters).toEqual(p.counters); // nothing the device holds is dropped by toWire
        expect(w.unlocked).toEqual([...p.unlocked].sort());
        expect(decodeWire(encodeWire(w))).toEqual(w);
        expect(bodyOf(w).length).toBeLessThanOrEqual(MAX_PROFILE_BYTES);
      }
    }
  });

  it("a seeded profile (CUSTOM-2a: built once from the old ghost pool and RUNS_KEY) passes the caps, whatever the pool held", () => {
    const store = new Map<string, string>();
    const st = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const snap = (runId: string, hero: string, day: number, wins: number) => ({ v: 2, rules: "x", hero, day, wins, lives: 5, build: {}, runId, playerId: "p", createdAt: 0 });
    store.set(SEED_GHOST_KEY, JSON.stringify([
      snap("a", "furnace", 1, 0), snap("a", "furnace", 2, 1), snap("a", "furnace", 6, 4), snap("b", "weaver", 3, 2), snap("b", "weaver", 10, 9),
      snap("c", "retired-hero", 4, 3), // a hero this build does not have: kept on the device, never sent
      snap("cur", "foundry", 2, 1), { junk: true },
    ]));
    store.set(SEED_SAVE_KEY, JSON.stringify({ runId: "cur", version: 8 }));
    store.set(SEED_RUNS_KEY, JSON.stringify({ runs: 12, last: "z" }));
    const p = seedProfile(st);
    expect(p.counters.runs).toBe(12); // max(distinct runs, RUNS_KEY.runs)
    expect(p.heroesWon).toContain("retired-hero");
    const w = toWire(p);
    expect(w.heroesWon).toEqual(["foundry", "furnace", "weaver"]); // sorted; the retired hero is dropped
    expect(() => checkWire({ ...w, updatedAt: NOW }, NOW)).not.toThrow();
    expect(w.counters).toEqual(p.counters);
    // STORMCALLER (4 different heroes won) was earned on the device with the retired hero counted; on the wire only the
    // three heroes the game has remain, so it is not sent (the server would refuse an unlock the upload does not earn)
    expect(p.unlocked).toContain("style:carrier.storm");
    expect(w.unlocked).not.toContain("style:carrier.storm");
    expect(w.unlocked).toEqual(p.unlocked.filter((k) => k !== "style:carrier.storm").sort());
  });

  it("toWire sends only what the server accepts: a stale or foreign id on the device is dropped, not refused", () => {
    const p = emptyProfile();
    p.updatedAt = NOW;
    p.counters.duskWins = 3;
    p.heroesWon = ["furnace", "retired-hero"];
    p.unlocked = ["style:floor.timber", "style:floor.removed", "hero:siphon", "style:belt.rune"]; // rune belt is unearned
    p.chosen = { floor: "timber", belt: "rune", panel: "slate", carrier: "war" };
    const w = toWire(p);
    expect(w.heroesWon).toEqual(["furnace"]);
    expect(w.unlocked).toEqual(["style:floor.timber"]);
    expect(w.chosen).toEqual({ floor: "timber", belt: "iron", panel: "slate", carrier: "war" }); // the pick that is not open wears the default
    expect(() => checkWire(w, NOW)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------- the merge

const sameProgress = (a: WireProfile, b: WireProfile): void => {
  expect(a.counters).toEqual(b.counters);
  expect(a.heroesWon).toEqual(b.heroesWon);
  expect(a.heroesFinished).toEqual(b.heroesFinished);
  expect(a.unlocked).toEqual(b.unlocked);
  expect(a.updatedAt).toBe(b.updatedAt);
};

describe("the merge", () => {
  it("counters take the max, sets the union (sorted), updatedAt the max", () => {
    const a = earnedWire({ runs: 5, runsFinished: 2, duskWins: 9, bestDay: 6 }, { won: ["weaver"], finished: ["weaver"] }, { updatedAt: NOW - 1000 });
    const b = earnedWire({ runs: 3, runsFinished: 3, duskWins: 14, bestDay: 4, mostBelts: 5 }, { won: ["furnace"] }, { updatedAt: NOW });
    const m = mergeWire(a, b);
    expect(m.counters).toEqual({ runs: 5, runsFinished: 3, flawless: 0, duskWins: 14, bestDay: 6, warlordWins: 0, matriarchWins: 0, mostBelts: 5 });
    expect(m.heroesWon).toEqual(["furnace", "weaver"]);
    expect(m.heroesFinished).toEqual(["weaver"]);
    expect(m.unlocked).toEqual([...new Set([...a.unlocked, ...b.unlocked])].sort());
    expect(m.updatedAt).toBe(NOW);
    expect(m.v).toBe(WIRE_V);
    expect(() => checkWire(m, NOW)).not.toThrow();
  });

  it("no stored profile: the merge is the upload, normalised", () => {
    const u = randomWire(rng(7));
    expect(mergeWire(null, u)).toEqual(u);
  });

  it("chosen follows the newer updatedAt, surface by surface; a tie goes to the upload", () => {
    const base = earnedWire({ duskWins: 100, bestDay: 9, runs: 5, runsFinished: 5, flawless: 1, warlordWins: 5, matriarchWins: 1, mostBelts: 3 }, { won: [...HERO_LIST], finished: HERO_LIST.slice(0, 3) });
    expect(base.unlocked.length).toBeGreaterThan(8);
    const pickA = { floor: "timber", belt: "rune", panel: "brass", carrier: "gold" };
    const pickB = { floor: "tread", belt: "verdigris", panel: "plum", carrier: "admiral" };
    const a = { ...base, chosen: pickA, updatedAt: NOW - 5000 };
    const b = { ...base, chosen: pickB, updatedAt: NOW };
    expect(mergeWire(a, b).chosen).toEqual(pickB); // the upload is newer
    expect(mergeWire(b, a).chosen).toEqual(pickB); // the stored one is newer
    expect(mergeWire(a, { ...b, updatedAt: a.updatedAt }).chosen).toEqual(pickB); // a tie: the upload
    expect(mergeWire({ ...a, updatedAt: b.updatedAt }, b).chosen).toEqual(pickB); // a tie: the upload
    expect(mergeWire({ ...b, updatedAt: a.updatedAt }, a).chosen).toEqual(pickA); // a tie, the other way round
  });

  it("a pick that the merged unlocks do not hold falls back to the other profile's pick, then to the default", () => {
    const rich = earnedWire({ duskWins: 100 }, {}, { updatedAt: NOW - 10 });
    const poor = earnedWire({ duskWins: 3 }, {}, { updatedAt: NOW });
    // the newer profile (poor) wears a style that nobody unlocked: an input that checkWire would have refused
    const odd = { ...poor, chosen: { floor: "rune", belt: "iron", panel: "slate", carrier: "gold" } };
    const m = mergeWire(rich, odd);
    expect(m.chosen.floor).toBe("plate"); // neither holds RUNE STONE (it needs heroes), so the default
    expect(rich.unlocked).toContain("style:carrier.gold");
    expect(m.chosen.carrier).toBe("gold"); // CHAMPION'S GOLD is in the merged unlocked (100 dusk wins), so the newer pick stands
  });

  it("properties on random valid profiles: counters and sets commutative, associative, idempotent; chosen follows the newer; the result is valid", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r: Rng = rng(seed * 7919);
      const [a, b, c] = [randomWire(r), randomWire(r), randomWire(r)];
      for (const w of [a, b, c]) expect(() => checkWire(w, NOW), `generator seed ${seed}`).not.toThrow();
      const ab = mergeWire(a, b), ba = mergeWire(b, a);
      sameProgress(ab, ba); // commutative
      sameProgress(mergeWire(mergeWire(a, b), c), mergeWire(a, mergeWire(b, c))); // associative
      expect(mergeWire(a, a)).toEqual(a); // idempotent, chosen included
      sameProgress(mergeWire(ab, b), ab); // idempotent: merging an upload again changes nothing
      sameProgress(mergeWire(ab, a), ab);
      // chosen follows the newer one (a tie: the upload)
      const newer = b.updatedAt >= a.updatedAt ? b : a;
      expect(ab.chosen, `seed ${seed}`).toEqual(newer.chosen);
      if (a.updatedAt !== b.updatedAt) expect(ba.chosen).toEqual(newer.chosen);
      // the merge of valid profiles is valid, and its progress is a superset of each
      expect(() => checkWire(ab, NOW), `merge seed ${seed}`).not.toThrow();
      for (const k of COUNTER_KEYS) expect(ab.counters[k]).toBeGreaterThanOrEqual(Math.max(a.counters[k], b.counters[k]));
      for (const id of [...a.unlocked, ...b.unlocked]) expect(ab.unlocked).toContain(id);
      expect(decodeWire(encodeWire(ab))).toEqual(ab); // and it is a canonical wire profile
    }
  });

  it("a tie in updatedAt with different picks: the upload wins, so merge is not symmetric in chosen only", () => {
    const base = earnedWire({ duskWins: 100, bestDay: 9 });
    const a = { ...base, chosen: { ...base.chosen, floor: "timber" }, updatedAt: NOW };
    const b = { ...base, chosen: { ...base.chosen, floor: "tread" }, updatedAt: NOW };
    expect(mergeWire(a, b).chosen.floor).toBe("tread");
    expect(mergeWire(b, a).chosen.floor).toBe("timber");
    sameProgress(mergeWire(a, b), mergeWire(b, a));
  });
});

describe("the wire form and the device's own rules agree on the styles", () => {
  it("every unlockable style key is a valid unlocked entry for the counters that earn it", () => {
    for (const s of SURFACES as readonly Surface[]) {
      for (const x of stylesOf(s).filter((y) => y.counter)) {
        const p = emptyProfile();
        p.updatedAt = NOW;
        if (x.counter === "heroesWon") p.heroesWon = HERO_LIST.slice(0, x.need);
        else if (x.counter === "heroesFinished") p.heroesFinished = HERO_LIST.slice(0, x.need);
        else (p.counters as unknown as Record<string, number>)[x.counter!] = x.need!;
        // keep the fold relations true for the counter under test
        p.counters.runsFinished = Math.max(p.counters.runsFinished, p.counters.flawless);
        p.counters.runs = Math.max(p.counters.runs, p.counters.runsFinished);
        p.counters.warlordWins = Math.max(p.counters.warlordWins, p.counters.matriarchWins);
        evaluateUnlocks(p);
        expect(p.unlocked, `${s}.${x.id}`).toContain(styleKey(s, x.id));
        const w = toWire(p);
        expect(w.unlocked).toContain(styleKey(s, x.id));
        expect(() => checkWire(w, NOW), `${s}.${x.id}`).not.toThrow();
      }
    }
  });
});
