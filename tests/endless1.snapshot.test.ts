// ENDLESS-1 3.4 (REQ-BFG-059; RULING E1: no new v3 field): snapshot v3's mode, endlessWins, endlessLives and victoryDay are TAKEN only
// under endlessFor(rules) (V3_LIVE stays false for them), in BOTH checks: the strict decoder (src/net/snapshot.ts checkSnapshot)
// and the client's (src/game/ghostSnapshot.ts isSnapshot). An endless snapshot carries mode "endless", wins = WIN_GOAL, victoryDay
// in WIN_GOAL..LONG_RUN_MAX_DAY, endlessWins 0..ENDLESS_WIN_CAP - 1, endlessLives 1..ENDLESS_LIVES (= its `lives`), a day after
// victoryDay and at most ENDLESS_LAST_DAY, and no LAST CHANCE from endless. Every bound of a run snapshot stays as it was.
import { afterAll, describe, expect, it } from "vitest";
import { RULES_VERSION } from "../src/sim/content";
import { ENDLESS, ENDLESS_LAST_DAY, ENDLESS_LIVES, ENDLESS_WIN_CAP, setEndless, withEndless } from "../src/sim/endless";
import { LONG_RUN_MAX_DAY, WIN_GOAL } from "../src/sim/longRun";
import { isSnapshot, setPlayerName } from "../src/game/ghostSnapshot";
import { V3_LIVE, V3_SNAPSHOT_FIELDS, SnapshotError, checkSnapshot, decodeSnapshot, encodeSnapshot, endlessMaxDay, endlessProblem, maxDayFor, maxRunes, maxWinsFor, v3LiveFor, type GhostSnapshot } from "../src/net/snapshot";
import { endlessFor } from "../src/net/rulesGate";
import { playEndless, WIN, LOSS } from "./endless1.honest";
import { TEST_NAME } from "./netIdentity";

setPlayerName(TEST_NAME);

// one honest endless: victory on day 10, then 30 endless dusks (a perfect endless: the snapshots run to day 40). The switch is on for
// the file (the checks read it), and the plays run at load time so the cases below can be built from them
setEndless(true);
const honest: GhostSnapshot[] = playEndless("furnace", 11, "snap-player", { endlessOutcomes: [WIN, WIN, LOSS, ...Array(40).fill(WIN)] }).endlessSnaps;
afterAll(() => setEndless(ENDLESS));

const at = (day: number): GhostSnapshot => honest.find((s) => s.day === day)!;
const bad = (s: GhostSnapshot, over: Record<string, unknown>): unknown => ({ ...s, ...over });
const refused = (v: unknown): string => {
  try {
    checkSnapshot(v);
  } catch (e) {
    expect(e).toBeInstanceOf(SnapshotError);
    return (e as Error).message;
  }
  return "";
};

describe("ENDLESS-1 3.4: the format (V3_LIVE keeps the four reserved; they are taken under endlessFor only)", () => {
  it("V3_LIVE still lists them off, and they are in V3_SNAPSHOT_FIELDS' order: seed, losses, mode, endlessWins, endlessLives, victoryDay", () => {
    for (const k of ["mode", "endlessWins", "endlessLives", "victoryDay"]) expect(V3_LIVE[k]).toBe(false);
    expect([...V3_SNAPSHOT_FIELDS]).toEqual(["seed", "losses", "mode", "endlessWins", "endlessLives", "victoryDay", "battleGold"]);
  });

  it("v3LiveFor: the four are live under rules with endless only; `losses` stays the long run's; battleGold stays off", () => {
    for (const k of ["mode", "endlessWins", "endlessLives", "victoryDay"]) {
      expect(v3LiveFor(k, RULES_VERSION)).toBe(true); // the switch is on in this file
      expect(v3LiveFor(k, "bb-0.10.0")).toBe(false); // rules before ENDLESS_RULES
      expect(v3LiveFor(k, "not rules")).toBe(false);
      withEndless(() => expect(v3LiveFor(k, RULES_VERSION)).toBe(false), false); // the switch off
    }
    expect(v3LiveFor("battleGold", RULES_VERSION)).toBe(false);
    expect(v3LiveFor("losses", RULES_VERSION)).toBe(true);
  });

  it("the bounds helpers: a run's day and wins bounds are exactly as before; the endless day bound is ENDLESS_LAST_DAY only under endless rules", () => {
    expect(maxDayFor(RULES_VERSION)).toBe(LONG_RUN_MAX_DAY);
    expect(maxWinsFor(RULES_VERSION, 12)).toBe(WIN_GOAL - 1);
    expect(maxWinsFor(RULES_VERSION, 4)).toBe(3);
    expect(endlessMaxDay(RULES_VERSION)).toBe(ENDLESS_LAST_DAY);
    withEndless(() => expect(endlessMaxDay(RULES_VERSION)).toBe(maxDayFor(RULES_VERSION)), false);
    expect(endlessMaxDay("bb-0.10.0")).toBe(maxDayFor("bb-0.10.0"));
    expect(maxRunes(RULES_VERSION)).toBe(LONG_RUN_MAX_DAY + 1); // a run's rune bound is untouched
    expect(maxRunes(RULES_VERSION, ENDLESS_LAST_DAY)).toBe(ENDLESS_LAST_DAY + 1); // an endless snapshot's
    expect(endlessFor(RULES_VERSION)).toBe(true);
  });
});

describe("ENDLESS-1 3.4: an honest endless snapshot (the game's own ghostOf) is taken by both checks, to its last day", () => {
  it("every honest dusk from the first endless day to day 40 decodes, round-trips byte for byte and passes isSnapshot", () => {
    expect(honest.length).toBeGreaterThan(30);
    expect(honest[0].day).toBe(11);
    expect(honest.at(-1)!.day).toBe(41); // a loss and 29 wins before the 30th dusk, which wins and ends it (the cap)
    expect(honest.at(-1)!.endlessWins).toBe(ENDLESS_WIN_CAP - 1);
    for (const s of honest) {
      const text = encodeSnapshot(s);
      expect(encodeSnapshot(decodeSnapshot(text))).toBe(text);
      expect(isSnapshot(JSON.parse(text))).toBe(true);
      expect([s.v, s.mode, s.wins]).toEqual([3, "endless", WIN_GOAL]);
      expect(s.lives).toBe(s.endlessLives);
    }
  });

  it("it carries the fields in the canonical order, after seed and the run's losses: seed, losses, mode, endlessWins, endlessLives, victoryDay", () => {
    const text = encodeSnapshot(at(20));
    expect(text).toMatch(/"seed":\d+,"losses":\d+,"mode":"endless","endlessWins":\d+,"endlessLives":[123],"victoryDay":10[,}]/);
    const s = at(14);
    expect(s.day - 1 - s.victoryDay!).toBeGreaterThanOrEqual(s.endlessWins!);
  });

  it("an endless snapshot holds one rune a dawn up to its day (day 40: 40 runes), where a run snapshot stops at LONG_RUN_MAX_DAY + 1", () => {
    expect(at(40).build.runes).toHaveLength(40);
    expect(checkSnapshot(at(40)).build.runes).toHaveLength(40);
    expect(isSnapshot(at(40))).toBe(true);
  });
});

describe("ENDLESS-1 3.4: the forgeries both checks refuse (each a one-field change to an honest dusk; the strict decoder throws, isSnapshot says no)", () => {
  const s = at(20); // day 20, victory day 10
  const cases: { name: string; mutate: Record<string, unknown>; message: RegExp }[] = [
    { name: "a run that is not won (9 wins)", mutate: { wins: 9 }, message: /snapshot\.wins: expected an integer in 10\.\.10/ },
    { name: "mode \"run\"", mutate: { mode: "run" }, message: /snapshot\.mode: expected "endless"/ },
    { name: "no victoryDay", mutate: { victoryDay: undefined }, message: /endless: an endless snapshot states endlessWins, endlessLives and victoryDay/ },
    { name: "no endlessWins", mutate: { endlessWins: undefined }, message: /endless: an endless snapshot states/ },
    { name: "endlessWins at the cap", mutate: { endlessWins: ENDLESS_WIN_CAP }, message: new RegExp(`snapshot\\.endlessWins: expected an integer in 0\\.\\.${ENDLESS_WIN_CAP - 1}`) },
    { name: "negative endlessWins", mutate: { endlessWins: -1 }, message: /snapshot\.endlessWins/ },
    { name: "more endless wins than endless dusks", mutate: { endlessWins: 12 }, message: /endlessWins: 12 wins in 9 endless dusks/ },
    { name: "no hearts", mutate: { endlessLives: 0, lives: 1 }, message: /snapshot\.endlessLives/ },
    { name: "too many hearts", mutate: { endlessLives: ENDLESS_LIVES + 1, lives: ENDLESS_LIVES + 1 }, message: /snapshot\.endlessLives/ },
    { name: "`lives` and endlessLives disagree", mutate: { lives: 2, endlessLives: 3 }, message: /lives: 2 is not the endlessLives 3/ },
    { name: "a victory day before WIN_GOAL", mutate: { victoryDay: WIN_GOAL - 1 }, message: /snapshot\.victoryDay/ },
    { name: "a victory day past LONG_RUN_MAX_DAY", mutate: { victoryDay: LONG_RUN_MAX_DAY + 1 }, message: /snapshot\.victoryDay/ },
    { name: "a day that is the victory day", mutate: { day: 10 }, message: /day: 10 is not after the victory day 10/ },
    { name: "a day before the victory day", mutate: { victoryDay: 22 }, message: /day: 20 is not after the victory day 22/ },
    { name: "a day past ENDLESS_LAST_DAY", mutate: { day: ENDLESS_LAST_DAY + 1 }, message: new RegExp(`snapshot\\.day: expected an integer in 1\\.\\.${ENDLESS_LAST_DAY}`) },
    { name: "run losses that the victory day cannot hold", mutate: { losses: 5 }, message: /losses: 5 run losses in the 0 dusks the victory day leaves/ },
    { name: "a LAST CHANCE taken after the victory day", mutate: { lastChance: { day: 12, boon: "hull" } }, message: /lastChance: LAST CHANCE never fires in endless \(day 12 is not before the victory day 10\)/ },
    { name: "a LAST CHANCE taken on the victory day", mutate: { lastChance: { day: 10, boon: "hull" } }, message: /LAST CHANCE never fires in endless/ },
    { name: "endless fields on a v2 snapshot", mutate: { v: 2 }, message: /not allowed in a v2 snapshot|snapshot\./ },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const forged = bad(s, c.mutate);
      expect(refused(forged), JSON.stringify(c.mutate)).toMatch(c.message);
      expect(isSnapshot(forged)).toBe(false);
    });
  }

  it("a LAST CHANCE from before the victory day is the RUN's: the shape is taken (the deck check is the server's)", () => {
    const withLc = bad(s, { lastChance: { day: 4, boon: "hull" } });
    expect(refused(withLc)).toBe("");
  });

  it("the fields without the switch (or under older rules) are refused as the format always refused them: not in this rules version yet", () => {
    withEndless(() => {
      expect(refused(s)).toMatch(/snapshot\.wins: expected an integer in 0\.\.9/); // an endless dusk is not a run's: its 10 wins are past a run ghost's
      expect(isSnapshot(s)).toBe(false);
      const carrying = bad(s, { wins: 9, losses: 10 }); // a run snapshot (9 wins, 10 losses in 19 dusks) that carries the fields: the reserved-field refusal, in the format's own words
      expect(refused(carrying)).toMatch(/snapshot\.mode: not in this rules version yet/);
      expect(isSnapshot(carrying)).toBe(false);
    }, false);
    const old = { ...s, rules: "bb-0.10.0" };
    expect(() => checkSnapshot(old)).toThrow(SnapshotError);
    expect(isSnapshot(old)).toBe(false);
  });

  it("endlessProblem (the one check) is silent on a run's snapshot and on every honest endless dusk", () => {
    expect(endlessProblem({ rules: RULES_VERSION, day: 12, wins: 4, lives: 8 })).toBeNull();
    for (const x of honest) expect(endlessProblem(x), `day ${x.day}`).toBeNull();
  });
});

describe("ENDLESS-1 3.4: every existing bound on a RUN snapshot stays exactly as it is, switch on", () => {
  const runSnap = (): GhostSnapshot => {
    const { mode: _m, endlessWins: _w, endlessLives: _l, victoryDay: _v, ...rest } = at(20);
    return { ...rest, day: 12, wins: 5, lives: 7, losses: 6 } as GhostSnapshot;
  };

  it("a run ghost is a dusk BEFORE its 10th win: wins 10 with no mode is refused; 9 is taken (maxWinsFor)", () => {
    const r = runSnap();
    expect(refused({ ...r, wins: 10 })).toMatch(/snapshot\.wins: expected an integer in 0\.\.9/);
    expect(isSnapshot({ ...r, wins: 10 })).toBe(false);
    expect(refused({ ...r, wins: 9, losses: 2, day: 12 })).toBe("");
  });

  it("a run's day stops at LONG_RUN_MAX_DAY (25), a run's runes at 26, and `losses` is still the dusks it lost (day - 1 - wins - draws)", () => {
    const r = runSnap();
    expect(refused({ ...r, day: LONG_RUN_MAX_DAY + 1 })).toMatch(/snapshot\.day: expected an integer in 1\.\.25/);
    expect(refused({ ...r, day: 12, wins: 5, losses: 12 })).toMatch(/snapshot\.losses/);
    expect(isSnapshot({ ...r, day: LONG_RUN_MAX_DAY + 1 })).toBe(false);
  });

  it("the switch off: a snapshot with no endless field is the same snapshot (byte for byte) as with it on", () => {
    const r = runSnap();
    const on = encodeSnapshot(r);
    const off = withEndless(() => encodeSnapshot(r), false);
    expect(off).toBe(on);
    expect(on).not.toContain("endless");
  });
});
