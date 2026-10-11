// HULL-1a (REQ-BFG-079, REQ-BFG-078): the server with both switches on, as AZ-BUMP will ship them. (h) The hull ceiling
// counts M through hullBonus, which stays a day-1 number, so validate.ts and roadCap.ts need no hull change: the upload
// driver's honest decks (tests/uploadDriver.ts on the NPC day, with their road logs) pass at days 1, 5 and 10 for every
// bb-0.10.0 hero (AZ-BUMP: was bb-0.9.7), and an over-budget hull is refused, with HULL_SCALE on or off alike. (i) REVIEW-NPC1 Q3: a road entry says
// when its warlord was sabotaged (`sabotaged: true`); the server checks exactly that one deck, and refuses the flag after
// a day with no SAPPERS with its own line; with NPC_DAY off the field is still refused (the endpoint's 400). Every test
// puts both switches back (afterEach).
import { afterEach, describe, expect, it } from "vitest";
import type { SideStats } from "../src/sim/battle";
import { HEROES, ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { roadShapeOk, setNpcDay } from "../src/sim/npcDay";
import { setHullScale } from "../src/sim/hullScale";
import { warlordOffer, type Difficulty } from "../src/sim/rivals";
import { choicesFor, eventFor, pickChoice } from "../src/game/events";
import { finishDay, ghostOf } from "../src/game/day";
import { finishWarlord, leaveCaravan, onToTheRoad, pickRoad, warlordDeck, warlordDrop } from "../src/game/road";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { checkSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { heroGateProblem } from "../src/net/rulesGate";
import { validateUpload } from "../src/net/validate";
import { driveRuns } from "./uploadDriver";

const Z: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
const HEROS = (Object.keys(HEROES) as HeroId[]).filter((h) => heroGateProblem(RULES_VERSION, h) === null); // bb-0.10.0's (AZ-BUMP: was bb-0.9.7's)
const PLATE = ITEMS.plating.supply!.hull!;

afterEach(() => { // the shipped values (AZ-BUMP's flip; were false): a test that reads a switch off sets it off itself
  setNpcDay(true);
  setHullScale(true);
});
const both = (on = true): void => {
  setNpcDay(on);
  setHullScale(on);
};
const check = (s: GhostSnapshot) => validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.road ? { road: s.road } : {}) });

describe("HULL-1a (h): the server with both switches on", () => {
  it("the upload driver's honest decks pass at days 1, 5 and 10 for every bb-0.10.0 hero, with their road logs", () => {
    both();
    const seen = new Set<string>();
    let n = 0;
    // NPC-1's seeds (tests/npc1.server.test.ts: 8100 on); 9100's FOUNDRY day 1 was NPC-1's known refusal, and passes since
    // HULL-1c's day-1 roadCap fix (the next test; tests/hull1c.base9106.test.ts runs every 9100 dusk)
    for (const policy of ["mixed", "warlord:hard", "event:sappers:HIRE|warlord:hard"] as const) {
      for (const r of driveRuns(policy === "mixed" ? 8 : 4, 8100, HEROS, policy)) {
        for (const d of r.dusks) {
          if (![1, 5, 10].includes(d.day)) continue;
          expect(d.roadLog!.length, `${d.hero} d${d.day}`).toBe(d.day);
          const v = validateUpload(d.build, d.day, RULES_VERSION, { seed: d.runSeed, road: d.roadLog });
          expect(v.errors, `${policy} ${d.hero} seed ${d.seed} d${d.day}: ${d.road}`).toEqual([]);
          seen.add(`${d.hero}:${d.day}`);
          n++;
        }
      }
    }
    for (const h of HEROS) for (const day of [1, 5, 10]) expect(seen.has(`${h}:${day}`), `${h} d${day}`).toBe(true);
    expect(n).toBeGreaterThanOrEqual(HEROS.length * 3 * 2);
  });

  it("NPC-1's one known refusal at hull1-base (FOUNDRY, driver seed 9106, day 1: a Hard win and the dock's PLATING) passes since HULL-1c's day-1 roadCap, with HULL_SCALE on and off", () => {
    // Found by HULL-1a and checked in a worktree of hull1-base (NPC_DAY on, no HULL_SCALE): 1 of 200 driver dusks
    // (seeds 9100-9107 and 8100-8111) refused, this one. NPC-1's road model on day 1 (REPORT, question 1); not a hull matter.
    // HULL-1c (REQ-BFG-078; REVIEW-HULL1A Q1), the same test made a pass: on the deck's own day roadCap lets the fight's gold
    // pay that day's event (the Hard win's 3 gold paid the PLATING's 2), so day 1 with the dock's PLATING is roadCap 0
    // (was -2). Was (re-pinned at HULL-1c, cap's oracle 46fecaf0a9972ea6): "budget: build costs 14 gold (items 9, mods 5,
    // 0 crates, 0 plating, road dock PLATING) but a player's day 1 allows at most 12 (maxGoldByDay 8 + roadCap -2 + drops 6)"
    const verdict = () => {
      const d = driveRuns(7, 9100, HEROS, "mixed")[6].dusks[0];
      expect([d.hero, d.seed, d.day]).toEqual(["foundry", 9106, 1]);
      expect(d.road).toMatch(/^hard [a-z0-9_]+: win, took [a-z0-9_]+; event dock: PLATING$/); // a Hard win's drop, then the PLATING
      expect(d.roadLog).toEqual([{ day: 1, tier: "hard", outcome: "win", drop: expect.any(String) }]);
      return validateUpload(d.build, d.day, RULES_VERSION, { seed: d.runSeed, road: d.roadLog }).errors;
    };
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): the first verdict is hull1-base's, HULL_SCALE off (it ships on)
    setNpcDay(true);
    expect(verdict()).toEqual([]);
    setHullScale(true);
    expect(verdict()).toEqual([]);
  });

  it("an over-budget hull is refused, the same with HULL_SCALE on or off (the ceiling is hullBonus in day-1 units)", () => {
    const lines: string[] = [];
    for (const [i, hero] of HEROS.entries()) {
      both();
      const [r] = driveRuns(1, 9300 + i, [hero], "mixed");
      for (const d of r.dusks.filter((x) => [1, 5, 10].includes(x.day))) {
        const at = (k: number) => validateUpload({ ...d.build, hullBonus: d.build.hullBonus + k * PLATE }, d.day, RULES_VERSION, { seed: d.runSeed, road: d.roadLog });
        expect(at(0).errors, `${hero} d${d.day}`).toEqual([]);
        let k = 1;
        while (k < 400 && at(k).ok) k++;
        const over = at(k);
        expect(over.ok, `${hero} d${d.day} +${k} packs`).toBe(false);
        // a client that sent the day's number (M(d) x the hull) as hullBonus is far over: refused
        const sent = validateUpload({ ...d.build, hullBonus: (HEROES[hero].hull + d.build.hullBonus) * 5 }, d.day, RULES_VERSION, { seed: d.runSeed, road: d.roadLog });
        expect(sent.ok, `${hero} d${d.day} x5`).toBe(false);
        lines.push(`${hero} d${d.day}: hullBonus ${d.build.hullBonus} ok; +${k} ARMOR PACKs (${k * PLATE}) refused: ${over.errors[0]}`);
        setHullScale(false); // the hull switch off: the same verdicts (M never enters the check)
        expect(at(0).ok).toBe(true);
        expect(at(k).ok).toBe(false);
        expect(at(k - 1).ok).toBe(true);
      }
    }
    console.log(`HULL1A-SERVER\n${lines.join("\n")}`);
  });
});

/** An honest run with both switches on, `days` NPC days through the game's rules: each dawn's first rune, the fork's
 *  `tier`, a won fight, the event's HIRE on a SAPPERS day (else its first open choice), REFIT, a dusk win; snapshotted at
 *  the last dusk. */
function sapped(hero: HeroId, seed: number, days: number, tier: Difficulty): GhostSnapshot {
  both();
  const run: Run = newRun(hero, seed, `hull1a-${hero}-${seed}`);
  let snap: GhostSnapshot | null = null;
  for (let d = 1; d <= days; d++) {
    const o = pendingRune(run);
    if (o) takeRune(run, o.ids[0]);
    leaveCaravan(run);
    expect(pickRoad(run, tier).ok).toBe(true);
    finishWarlord(run, 0, 20);
    onToTheRoad(run);
    const list = choicesFor(run);
    const hire = run.event?.id === "sappers" ? list.findIndex((c) => c.label === "HIRE" && !c.blocked) : -1;
    const i = hire >= 0 ? hire : list.findIndex((c) => !c.blocked);
    if (i >= 0) pickChoice(run, i);
    onToTheRoad(run);
    leaveCaravan(run);
    snap = ghostOf(run, 1_790_000_000_000, "p-hull1a", null);
    if (d < days) finishDay(run, 0, 30, { ...Z }, { ...Z });
  }
  return snap!;
}

/** The first honest run (FURNACE, MEDIUM) with a sabotaged win whose two decks' seeded rolls differ: the run, the entry's
 *  index, and the plain deck's roll. */
function sabotagedCase(): { s: GhostSnapshot; i: number; plain: string | null } {
  for (let seed = 1; seed < 400; seed++) {
    const s = sapped("furnace", seed, 9, "medium");
    for (const [i, e] of s.road!.entries()) {
      if (!e.sabotaged || e.outcome !== "win") continue;
      const id = warlordOffer(s.seed!, e.day)[e.tier];
      const plain = warlordDrop(s.seed!, e.day, id, e.tier, warlordDeck(id, e.day, false));
      const sab = warlordDrop(s.seed!, e.day, id, e.tier, warlordDeck(id, e.day, true));
      expect(e.drop ?? null).toBe(sab);
      if (plain !== sab) return { s, i, plain };
    }
  }
  throw new Error("no sabotaged win with two different rolls in 400 seeds");
}

describe("HULL-1a (i): REVIEW-NPC1 Q3, the road entry says when its warlord was sabotaged (REQ-BFG-078)", () => {
  it("an honest sabotaged day passes: the log carries `sabotaged: true` on that day only, and the decoder keeps it", () => {
    const { s, i } = sabotagedCase();
    const e = s.road![i];
    expect(e.sabotaged).toBe(true);
    expect(eventFor(s.seed!, e.day - 1)).toBe("sappers");
    for (const x of s.road!) if (x.sabotaged) expect(eventFor(s.seed!, x.day - 1)).toBe("sappers");
    expect(Object.keys(e).pop()).toBe("sabotaged"); // last, after drop
    expect(check(s).errors).toEqual([]);
    const c = checkSnapshot(JSON.parse(JSON.stringify(s)));
    expect(c.road).toEqual(s.road);
    expect(isSnapshot(c)).toBe(true);
    setHullScale(false); // Q3 is NPC_DAY's: the hull switch changes nothing here
    expect(check(s).errors).toEqual([]);
  });

  it("exactly one deck is checked: the other deck's roll is refused, flagged or not", () => {
    const { s, i, plain } = sabotagedCase();
    const e = s.road![i];
    // the flag kept, the plain deck's roll named: refused (SABOTAGE's deck rolled e.drop)
    const swap = s.road!.map((x, j) => {
      if (j !== i) return x;
      const { drop: _, ...rest } = x;
      return plain ? { ...rest, drop: plain } : rest;
    });
    const r1 = check({ ...s, road: swap });
    expect(r1.ok).toBe(false);
    expect(r1.errors[0]).toMatch(new RegExp(`^road: day ${e.day}: `));
    // the flag dropped, SABOTAGE's roll kept: refused (the plain deck rolled something else)
    const unflagged = s.road!.map((x, j) => (j === i ? (({ sabotaged: _, ...rest }) => rest)(x) : x));
    const r2 = check({ ...s, road: unflagged });
    expect(r2.ok).toBe(false);
    expect(r2.errors[0]).toMatch(new RegExp(`^road: day ${e.day}: `));
    console.log(`HULL1A-Q3 seed ${s.seed} day ${e.day}: honest ${e.drop}; the plain deck's roll ${plain ?? "no drop"}\n  flagged with the plain roll: ${r1.errors[0]}\n  unflagged: ${r2.errors[0]}`);
  });

  it("a flag after a day with no SAPPERS is refused with its own line (day 1 too)", () => {
    const s = sapped("weaver", 21, 4, "easy");
    both();
    const j = s.road!.findIndex((x) => x.day > 1 && eventFor(s.seed!, x.day - 1) !== "sappers");
    expect(j).toBeGreaterThanOrEqual(0);
    const d = s.road![j].day;
    const forged = s.road!.map((x, k) => (k === j ? { ...x, sabotaged: true as const } : x));
    expect(check({ ...s, road: forged }).errors[0]).toBe(`road: day ${d}: sabotaged, but day ${d - 1} met no SAPPERS`);
    const first = s.road!.map((x) => (x.day === 1 ? { ...x, sabotaged: true as const } : x));
    expect(check({ ...s, road: first }).errors[0]).toBe("road: day 1: sabotaged, but no day came before it");
    // a loss can be flagged too (the deck it lost to), and is held to the same rule
    const loss = forged.map((x, k) => (k === j ? (({ drop: _, ...rest }) => ({ ...rest, outcome: "loss" as const }))(x) : x));
    expect(check({ ...s, road: loss }).errors[0]).toBe(`road: day ${d}: sabotaged, but day ${d - 1} met no SAPPERS`);
  });

  it("the key is true only (absent otherwise); with NPC_DAY off the field is still refused (400)", () => {
    const { s, i } = sabotagedCase();
    both();
    for (const bad of [false, "yes", 1, null]) {
      const road = s.road!.map((x, j) => (j === i ? { ...x, sabotaged: bad } : x));
      expect(() => checkSnapshot({ ...s, road } as unknown as GhostSnapshot), String(bad)).toThrow(`snapshot.road[${i}].sabotaged: expected true (or no key)`);
      expect(roadShapeOk(road, s.day)).toBe(false);
    }
    expect(roadShapeOk(s.road, s.day)).toBe(true);
    for (const hull of [true, false]) {
      setNpcDay(false);
      setHullScale(hull);
      expect(() => checkSnapshot(s)).toThrow("snapshot.road: not in this rules version yet");
      expect(isSnapshot(s)).toBe(false);
      expect(check(s).errors).toEqual(["road: not in this rules version yet"]);
    }
  });
});
