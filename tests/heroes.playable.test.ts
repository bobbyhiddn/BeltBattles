// 0.8.0 H1 M2 (REQ-BFG-011, REQ-BFG-021, REQ-BFG-032): FOUNDRY and BASTION are playable. The roster and hero select;
// each hero's trick sentence from the real values; a new run starts from heroStartBuild with the extra turret slot; full
// 10-day runs through the game's own day loop (the caravan, the road's events and warlords, the dusk, save and load at
// every step, the run's end); and the dusk foes are the same hero-blind stand-ins every hero meets.
// BUMP-1D (LONG_RUN on since bb-0.11.0): a new run is a LONG run (won at 10 wins, lost at 0 hearts, no day limit), so the loop
// that played RUN_DAYS days and expected the run's end now ends the run no more. The 10-day world is kept as it was, under
// withLongRun(fn, false) ("full 10-day runs ..."), and its twin plays the default world to the run's end ("full long runs ...").
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import { battleSeed, buyOffer, installFromCargo, loadRun, newRun, reroll, saveRun, type Run } from "../src/game/run";
import { finishDay, startDusk } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import { finishWarlord, forkFor, onToTheRoad, pickRoad, todaysWarlord, topParts, warlordSeed } from "../src/game/road"; // AZ-BUMP: onToTheRoad (was takePart)
import { choicesFor, pickChoice } from "../src/game/events";
import { ORDER } from "../src/screens/hero";
import { PORTRAIT_KEYS } from "../src/render/portraits";
import { SIM, heroTrick } from "../src/ui/abilityText";
import { FURNACE_LONG_BELT, simulate } from "../src/sim/battle";
import { bestSpot } from "../src/sim/beltside";
import { AMMO, FRAY_BONUS, FRAY_MAX, HEROES, ITEMS, RUN_DAYS, type HeroId } from "../src/sim/content";
import { rateMul } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): a whole rate % as its speed multiplier
import { canFitGear, coreFor, installedTurrets, turretSlots } from "../src/sim/deck";
import { PLAYABLE_HEROES, heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { PAR_FIELD_HEROES, parRefs, parSourceFor } from "../src/sim/harness/par";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { STAND_IN_HEROES } from "../src/net/fallback";
import { generateSamplePool } from "../tools/samplePool";
import { FUSE_MULT, SYNC_WINDOW } from "../src/sim/races/foundry";
import { fmtPct } from "../src/ui/statFormat"; // NUM-4 (REQ-BFG-047): FUSE_MULT as a whole %
import { PLATE_CAP, PLATE_PER_SLUG } from "../src/sim/races/bastion";
import { validateBuild } from "../src/net/validate";
import { outputsAt } from "../src/sim/stars"; // bb-0.8.3 (REQ-BFG-042): belt slots by stars
import { LONG_RUN, WIN_GOAL, longRun, withLongRun } from "../src/sim/longRun"; // BUMP-1D (LONG_RUN on): the 10-day world and the long run side by side
import { endlessOffered } from "../src/sim/endless"; // BUMP-1E P6: ENDLESS ships on: a won run's RUN WON offer keeps its save
import { readFileSync } from "node:fs";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("the roster and hero select", () => {
  it("offers FURNACE, WEAVER, FOUNDRY and BASTION, in that order, each with a portrait", () => {
    expect([...PLAYABLE_HEROES]).toEqual(["furnace", "weaver", "foundry", "bastion"]);
    expect([...ORDER]).toEqual([...PLAYABLE_HEROES]);
    for (const h of PLAYABLE_HEROES) expect(PORTRAIT_KEYS).toContain(h);
  });

  it("a new run of each hero starts from heroStartBuild, with the hull's extra turret slot empty", () => {
    for (const h of PLAYABLE_HEROES) {
      const run = newRun(h, 7, "start");
      expect(run.build, h).toEqual(heroStartBuild(h, 1));
      const slots = turretSlots(run.build);
      expect(slots.length, h).toBe(HEROES[h].turrets.length + 1);
      expect(slots[slots.length - 1].turret, h).toBeUndefined();
      expect(slots.slice(0, -1).every((s) => !!s.turret), h).toBe(true);
      expect(validateBuild(run.build, 1).errors, h).toEqual([]);
    }
    expect(turretSlots(heroStartBuild("foundry")).map((s) => [s.col0, s.td?.kind ?? "empty"])).toEqual([[2, "medium"], [6, "medium"], [4, "empty"]]);
    expect(turretSlots(heroStartBuild("bastion")).map((s) => [s.col0, s.td?.kind ?? "empty"])).toEqual([[4, "heavy"], [0, "empty"]]);
  });
});

describe("each hero's trick in one plain sentence (REQ-BFG-032)", () => {
  const T = Object.fromEntries(PLAYABLE_HEROES.map((h) => [h, heroTrick(h)]));

  it("one whole sentence each: capitals, a full stop, no glued seconds, no X2 or slash rates, no '·'", () => {
    for (const [h, s] of Object.entries(T)) {
      const plain = s.replace(/\d\.\d/g, "#"); // decimals aside, one sentence ending in its only full stop
      expect(plain, h).toMatch(/^[A-Z][^.]*\.$/);
      expect(plain.split(".").length - 1, h).toBe(1);
      expect(s, h).not.toMatch(/\d(S|X)\b|\bX\d|\/|·/);
      expect(s, h).toBe(s.toUpperCase());
    }
  });

  it("quotes the sim's own numbers", () => {
    const num = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    // NUM-2 (REQ-BFG-047): FURNACE_LONG_BELT is a whole rate % (+39; was the interval x0.72), so the rate up is
    // rateMul(39) - 1 (was 1 / 0.72 - 1): 39% FASTER either way
    expect(num(T.furnace)).toEqual([AMMO.cinder.rideScale, SIM.furnaceLongTiles, Math.round((rateMul(FURNACE_LONG_BELT) - 1) * 100)]);
    // bb-0.8.3 (REQ-BFG-042 D2): FactorySpec.outputs is gone; the LOOM's belt slots at ★1 are outputsAt's (3, as before)
    expect(num(T.weaver)).toEqual([outputsAt("loom", 1), FRAY_BONUS, FRAY_MAX]);
    // NUM-4 (REQ-BFG-047, N1 2.2): FOUNDRY's trick quotes FUSE_MULT as a whole % (15, fmtPct); the pair window
    // (SYNC_WINDOW 0.25 s) is a hidden sub-second timer, so the sentence names it AT ONCE instead of quoting it (was
    // [SYNC_WINDOW, FUSE_MULT] = [0.25, 1.15], "... WITHIN 0.25 SECONDS FUSE INTO ONE SLUG WITH 1.15 TIMES THEIR DAMAGE.")
    expect(SYNC_WINDOW).toBeLessThan(1);
    expect(num(T.foundry)).toEqual([parseFloat(fmtPct(FUSE_MULT - 1))]);
    expect(num(T.bastion)).toEqual([PLATE_PER_SLUG, PLATE_CAP]);
    expect(T.foundry).toBe(`ITS CRUCIBLE POURS A BLANK ONTO BOTH ITS BELTS AT ONCE, AND TWO BLANKS THAT REACH ONE GUN AT ONCE FUSE INTO ONE SLUG THAT DEALS THEIR DAMAGE AND ${fmtPct(FUSE_MULT - 1)} MORE.`);
    // NUM-1 (REQ-BFG-047): PLATE_PER_SLUG and PLATE_CAP x10 (were 2 and 24)
    expect(T.bastion).toBe("ITS BULWARK SLUGS SHIELD YOUR HULL AS THEY LOAD, 20 EACH UP TO 240 SHIELD, AND SHIELD TAKES HITS AND BURN BEFORE YOUR HULL DOES.");
    // the FURNACE breech's 8 tiles are battle.ts's own threshold (makeTurret: `< 8` means no long belt)
    expect(readFileSync(new URL("../src/sim/battle.ts", import.meta.url), "utf8")).toMatch(/journeyTiles\(b, ri\)\) < 8\) return false;/);
    // "BOTH ITS BELTS": the starting CRUCIBLE's 2 belt slots (bb-0.8.3: outputsAt at ★1), each taking a blank of its pour of 2
    expect([outputsAt("crucible", 1), ITEMS.crucible.factory!.pour]).toEqual([2, 2]);
  });
});

// ------------------------------------------------------------------------------------------------- full 10-day runs

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k),
  };
}

/** Save and load through the game's own save (localStorage, SAVE_KEY) and return the loaded run; it must equal `run`. */
function roundTrip(run: Run): Run {
  saveRun(run);
  const back = loadRun();
  expect(back, `${run.hero} day ${run.day} ${run.stage}`).toEqual(run);
  return back!;
}

/** The simple player of the H1 offline probe: buys what it can afford and place, in wagon and slot order. */
function shop(run: Run): number {
  let n = 0;
  run.shop.wagons.forEach((w, wi) => w.offers.forEach((o, si) => {
    if (o.sold || o.price > run.gold) return;
    const d = ITEMS[o.def];
    if (d.kind === "gate") {
      const s = bestSpot(run.build, o.def);
      if (s && s.hits.length && buyOffer(run, wi, si, { x: s.x, y: s.y, rot: s.rot }).ok) n++;
    } else if (d.kind === "mod") {
      const t = installedTurrets(run.build).find((v) => canFitGear(run.build, v.slot, o.def).ok);
      if (t && buyOffer(run, wi, si, { turret: t.slot }).ok) n++;
    } else if (d.kind === "core") {
      const t = installedTurrets(run.build).find((v) => !coreFor(run.build, v.slot));
      if (t && buyOffer(run, wi, si, { turret: t.slot }).ok) n++;
    } else if (d.kind === "turret") {
      const empty = turretSlots(run.build).find((v) => !v.turret);
      const r = empty ? buyOffer(run, wi, si) : null;
      const uid = r?.ok ? r.gain?.survivor : undefined;
      if (r?.ok) n++;
      if (empty && uid !== undefined && run.inventory.some((i) => i.uid === uid)) installFromCargo(run, uid, empty.slot);
    } else if (buyOffer(run, wi, si).ok) n++;
  }));
  return n;
}

interface Played { run: Run; dusks: number; buys: number; events: number; warlords: number; foes: string[] }

/** BUMP-1D: the most days one LONG run is played (a 10-day run is played for RUN_DAYS). A long run has no day limit: it ends at
 *  its WIN_GOAL-th win or at 0 hearts, so a run with at most 3 scripted losses ends at its 10th win (10 to 13 dusks), and one
 *  on the fights' own results at 10 wins or 0 hearts (LONG_RUN_DEEPEST_DAY, 17, without a draw). 40 is far past both; a run
 *  still going at it fails the "ends" checks below. */
const LONG_PLAY_DAYS = 40;

/** One seeded run of `hero` through the game's day loop, a save/load round trip at every step. `scripted`: a scripted
 *  outcome instead of the fight's (at most 3 losses), so the run reaches day 10 (BUMP-1D: its end, a long run's 10th win,
 *  10 to 13 dusks on); the fight is still simulated. The run plays the rule it started on (newRun reads the switch). */
function play(hero: HeroId, seed: number, scripted: boolean): Played {
  let run = newRun(hero, hashSeed("h1-play", seed), `h1-play-${hero}-${seed}`);
  const out: Played = { run, dusks: 0, buys: 0, events: 0, warlords: 0, foes: [] };
  let losses = 0;
  for (let guard = 0; guard < (longRun(run) ? LONG_PLAY_DAYS : RUN_DAYS) && !run.over; guard++) { // BUMP-1D: was guard < RUN_DAYS
    run = roundTrip(run); // dawn
    if (hashSeed(seed, run.day, "h1-reroll") % 3 === 0 && run.gold >= 4) reroll(run);
    out.buys += shop(run);
    run = roundTrip(run); // after the caravan
    // AZ-BUMP (the flip, NPC_DAY): the shipped day. The fork offers the three warlords (pickRoad(run, "event") is refused), the
    // fight is simulated and its result taken (a win's drop goes to cargo; no pick of 2), then ON TO THE ROAD opens the day's
    // event, won or lost, and its first open choice leads to REFIT and the dusk (main.ts openNpcDay's order). Was one stop a
    // day: the event, or an Easy, Medium or Hard warlord (Hard's pick of 2)
    const pick = (["easy", "medium", "hard"] as const)[hashSeed(seed, hero, run.day, "h1-road") % 3];
    expect(forkFor(run).day).toBe(run.day);
    expect(pickRoad(run, pick).ok).toBe(true);
    const w = todaysWarlord(run)!;
    const wb = simulate(run.build, w.build, warlordSeed(run));
    finishWarlord(run, wb.winner as 0 | 1 | -1, wb.t);
    out.warlords++;
    if (onToTheRoad(run) === "event") {
      const i = choicesFor(run).findIndex((c) => !c.blocked);
      expect(pickChoice(run, i).ok).toBe(true);
      out.events++;
    }
    expect(onToTheRoad(run)).toBe("refit"); // the event resolved: REFIT before the dusk
    run = roundTrip(run); // after the road
    expect(validateBuild(run.build, run.day).errors.filter((e) => !/^(supply|budget):/.test(e)), `${hero} #${seed} d${run.day}`).toEqual([]);
    const foe = startDusk(run, []);
    out.foes.push(`${run.day}:${foe.kind}:${foe.rival}:${foe.hero}`);
    expect(foe).toEqual({ day: run.day, kind: "standin", name: standInFoe(run.seed, run.day).name, hero: standInFoe(run.seed, run.day).hero, build: standInFoe(run.seed, run.day).build, rival: standInFoe(run.seed, run.day).id });
    run = roundTrip(run); // dusk stored
    const b = simulate(run.build, foe.build, battleSeed(run));
    let winner = b.winner as 0 | 1 | -1;
    if (scripted) {
      const lose = losses < 3 && hashSeed(seed, hero, run.day, "h1-lose") % 3 === 0;
      winner = lose ? 1 : 0;
      if (lose) losses++;
    }
    finishDay(run, winner, b.t, b.sides[0].stats, b.sides[1].stats);
    out.dusks++;
  }
  saveRun(run); // a finished run clears the save
  // BUMP-1E P6 (R3.5): ENDLESS ships on, so a WON run (newRun marks it) is the one finished run whose save is KEPT while its RUN WON offer is open (save.ts saveRun: a
  // reload offers CONTINUE ENDLESS or END RUN again; tests/endless1.save.test.ts pins it); every other finished run, a lost one included, clears it as ever (was expect(loadRun()).toBe(null))
  if (endlessOffered(run)) expect(loadRun(), `${hero} #${seed}: the won run's offer is kept`).not.toBe(null);
  else expect(loadRun()).toBe(null);
  out.run = run;
  return out;
}

// BUMP-1D: both worlds, side by side. long = false: the 10-day run (the switch off, the pre-bb-0.11.0 world: a run is played to
// day RUN_DAYS and ends "complete" there or "lost" at 0 hearts), the old tests as they were under withLongRun(fn, false);
// long = true: the shipped world, a long run (won at WIN_GOAL wins or lost at 0 hearts, any number of days). A run plays the
// rule it started on, so each test sets the switch around its whole body (newRun reads it once).
for (const long of [false, true]) {
  describe(long ? "full long runs (10 wins or 0 hearts, no day limit) with FOUNDRY and BASTION" : "full 10-day runs with FOUNDRY and BASTION", () => {
    let saved: unknown;
    beforeAll(() => {
      saved = (globalThis as { localStorage?: unknown }).localStorage;
      (globalThis as { localStorage?: unknown }).localStorage = memStorage();
    });
    afterAll(() => {
      (globalThis as { localStorage?: unknown }).localStorage = saved;
    });
    /** The run's win: a 10-day run's "complete" (it survived day 10), a long run's "won" (its 10th dusk win). */
    const WON = long ? "won" : "complete";

    for (const hero of ["foundry", "bastion"] as const) {
      it(`${hero.toUpperCase()}: 20 runs play every day to the run's end (caravan, road, dusk, save and load at every step)`, () => withLongRun(() => {
        let complete = 0, lost = 0, dusks = 0, buys = 0, events = 0, warlords = 0;
        for (let seed = 1; seed <= 20; seed++) {
          const p = play(hero, seed, seed % 2 === 0);
          expect(p.run.over, `${hero} #${seed}`).not.toBe(null);
          if (p.run.over === WON) complete++; // BUMP-1D: "complete" on the 10-day run (the old count), "won" on the long run
          else lost++;
          dusks += p.dusks;
          buys += p.buys;
          events += p.events;
          warlords += p.warlords;
          if (seed % 2 === 0) expect(p.run.over, `${hero} #${seed} (scripted)`).toBe(WON);
          expect(p.run.hero).toBe(hero);
          expect(p.run.build.items.filter((x) => x.def === HEROES[hero].factory), `${hero} #${seed}: the signature stays aboard`).toHaveLength(1);
          // BUMP-1D: the run played the rule it started on, and its end is that rule's: a 10-day run ends after day RUN_DAYS or at
          // 0 hearts; a long run at its WIN_GOAL-th win ("won") or at 0 hearts ("lost"), however many days that took
          expect(longRun(p.run), `${hero} #${seed}: the run's mark`).toBe(long);
          if (long) {
            expect(p.run.over === "won" ? p.run.wins : p.run.lives, `${hero} #${seed}: won at ${WIN_GOAL} wins or lost at 0 hearts`).toBe(p.run.over === "won" ? WIN_GOAL : 0);
            expect(p.dusks, `${hero} #${seed}: every dusk is a win, a loss or a draw`).toBe(p.run.history.length);
          } else {
            expect(p.run.over === "complete" ? p.run.day : p.run.lives, `${hero} #${seed}: complete after day ${RUN_DAYS} or lost at 0 hearts`).toBe(p.run.over === "complete" ? RUN_DAYS : 0);
          }
        }
        expect(complete).toBeGreaterThanOrEqual(10);
        expect(dusks).toBeGreaterThan(150);
        expect(buys).toBeGreaterThan(100);
        expect(events).toBeGreaterThan(10);
        expect(warlords).toBeGreaterThan(20);
        console.log(`${hero}: 20 ${long ? "long" : "10-day"} runs, ${complete} ${WON}, ${lost} lost, ${dusks} dusks, ${buys} buys, ${events} events, ${warlords} warlord fights`);
      }, long), 300_000);
    }

    it("the dusk foes are hero-blind: a FOUNDRY and a BASTION run meet exactly the stand-ins a FURNACE run of the same seed meets", () => withLongRun(() => {
      for (let seed = 1; seed <= 12; seed++) {
        const [fu, fo, ba] = (["furnace", "foundry", "bastion"] as const).map((h) => play(h, seed, true).foes.map((f) => f.split(":").slice(0, 4).join(":")));
        // BUMP-1D: a 10-day run meets RUN_DAYS foes, one a day. A long run meets one per dusk, 10 wins and the scripted losses
        // (hashSeed(seed, hero, day): they fall on each hero's own days, so the runs differ in length, 10 to 13): the foes agree
        // day by day over the shortest run, which reaches at least day RUN_DAYS (and, as the strings name their day, line up)
        if (!long) expect(fu).toHaveLength(RUN_DAYS);
        const n = Math.min(fu.length, fo.length, ba.length);
        expect(n, `seed ${seed}`).toBeGreaterThanOrEqual(RUN_DAYS);
        expect(fo.slice(0, n), `seed ${seed}`).toEqual(fu.slice(0, n));
        expect(ba.slice(0, n), `seed ${seed}`).toEqual(fu.slice(0, n));
      }
    }, long), 300_000);
  });
}

describe("the shipped world is the long run (BUMP-1D)", () => {
  it("LONG_RUN is on: a new run of each hero is a long run, a 10-day run only under withLongRun(fn, false)", () => {
    expect(LONG_RUN).toBe(true);
    for (const h of PLAYABLE_HEROES) {
      expect(longRun(newRun(h, 7, "start")), h).toBe(true);
      expect(longRun(withLongRun(() => newRun(h, 7, "start"), false)), h).toBe(false);
    }
  });
});

describe("growing the roster moves no harness number (par.ts) and no foe pool (fallback.ts)", () => {
  it("the par field stays FURNACE's and WEAVER's; every race hero keeps its heroRefBuild par, as before 0.8.0", () => {
    expect([...PAR_FIELD_HEROES]).toEqual(["furnace", "weaver"]);
    for (const h of HARNESS_HEROES) {
      expect(parSourceFor(h, "field"), h).toBe(h === "furnace" || h === "weaver" ? "field" : "heroref");
      expect(parSourceFor(h, "heroref"), h).toBe("heroref");
    }
    for (const day of [1, 5, 10]) for (const h of ["foundry", "bastion"] as const) expect(parRefs(h, day), `${h} d${day}`).toEqual([heroRefBuild(h, day)]);
  });

  it("the stand-in heroes stay FURNACE and WEAVER; the seed ghosts' heroes are the four playable heroes (0.8.0 RC)", () => {
    expect([...STAND_IN_HEROES]).toEqual(["furnace", "weaver"]);
    expect(new Set(generateSamplePool().map((g) => g.hero))).toEqual(new Set(["furnace", "weaver", "foundry", "bastion"])); // 0.8.0 RC (oracle 96e0ebe434a93f2b): was FURNACE and WEAVER
  }, 600_000); // AZ-BUMP (the flip): generateSamplePool (the whole seed pool, its race decks from par runs), longer with the NPC
  // day; a host timeout under the 1.5-CPU quota, not the rule (timed out at vitest's 30 s default)
});

describe("the road's reward parts never include any hero's signature factory", () => {
  it("topParts skips the KILN and the LOOM as before, and now the CRUCIBLE, the WARDWORKS and every other signature", () => {
    for (const h of Object.keys(HEROES) as HeroId[]) {
      const b = clone(heroStartBuild(h, 1));
      b.items.push({ uid: 900, def: "whetstone", x: 0, y: 0 });
      expect(topParts(b, 5), h).toEqual(["whetstone"]);
    }
  });
});
