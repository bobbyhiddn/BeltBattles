// 0.8.0 N1 (REQ-BFG-011, REQ-BFG-024, REQ-BFG-033; ref/BRIEF-wave3-N1.md sections 3-4, DESIGN-wave3 section 5, VERIFIED-D1
// Q9 and Q12): the six wave-3 captains on the roster. Four race warlords take both jobs (BRASSWICK and MASTER VOSS on
// FOUNDRY's hull, GRIMHOLD and THANE KARSK on BASTION's); LOCKJAW (FURNACE) and THISTLEMAIL (WEAVER) stand in at dusk only.
// The road pools are 4 Easy, 5 Medium and 7 Hard plus the Iron Matriarch on days 8-10, and the stand-in order draws from
// the 18 captains other than her. Here: the roster, the road and stand-in rules over 2,000 run seeds, the Hard prizes
// inside today's economy (the upload ceiling, src/net/roadCap.ts, is unchanged), and saves written before N1.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import {
  DIFFICULTIES, MATRIARCH_DAY, RIVALS, RIVAL_IDS, RUN_DAYS, difficultyOf, luckOf, standInGhosts, warlordOffer, warlordOffers,
  warlordPool, type RivalId,
} from "../src/sim/rivals";
import { PLANS } from "../src/sim/rivalBuilds";
import { finishWarlord, forkFor, pickRoad, roadChosen, takePart, todaysWarlord, warlordDeck, warlordDeckDay, warlordReward, warlordSeed } from "../src/game/road";
import { battleSeed, buyOffer, installFromCargo, migrateRun, type Run } from "../src/game/run";
import { finishDay, startDusk } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import { choicesFor, pickChoice } from "../src/game/events";
import { simulate } from "../src/sim/battle";
import { bestSpot } from "../src/sim/beltside";
import { ITEMS, type HeroId } from "../src/sim/content";
import { canFitGear, coreFor, installedTurrets, turretSlots } from "../src/sim/deck";
import { valueOf } from "../src/sim/stars";
import { LUCK_HEROES } from "../src/sim/harness/luck";
import { LUCK_CAPS } from "../src/sim/harness/luckCapsData";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";

const SIX: RivalId[] = ["brasswick", "voss", "grimhold", "karsk", "lockjaw", "thistlemail"];
const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const SEEDS = Array.from({ length: 2000 }, (_, i) => hashSeed("n1-roster", i) >>> 0);

describe("the six wave-3 captains join the roster (0.8.0 N1)", () => {
  it("come after the 13 with D1's hero, name and trick, in their slots: BRASSWICK Easy, GRIMHOLD Medium, VOSS and KARSK Hard", () => {
    expect(RIVAL_IDS.slice(0, 13)).toEqual(["sootjaw", "nettle", "grubnose", "mothqueen", "sparkfang", "lacewing", "ratchet", "emberlyn", "bulwark", "silkshade", "longtooth", "highspire", "matriarch"]);
    expect(RIVAL_IDS.slice(13)).toEqual(SIX);
    const want: Record<string, [HeroId, string, string, string | null, string]> = {
      brasswick: ["foundry", "BRASSWICK", "MATCHED POUR", "easy", "ordinary"],
      voss: ["foundry", "MASTER VOSS", "LOCKSTEP", "hard", "good"],
      grimhold: ["bastion", "GRIMHOLD", "ANVIL WALL", "medium", "ordinary"],
      karsk: ["bastion", "THANE KARSK", "SHIELD WALL", "hard", "good"],
      lockjaw: ["furnace", "LOCKJAW", "TWIN BITE", null, "ordinary"],
      thistlemail: ["weaver", "THISTLEMAIL", "LEAF MAIL", null, "ordinary"],
    };
    for (const id of SIX) {
      const r = RIVALS[id];
      expect([r.hero, r.name, r.trick, difficultyOf(id), luckOf(id)], id).toEqual(want[id]);
      expect(r.rank, id).toBe("regular"); // no rank frame on any of the six
      expect(!!r.standInOnly, id).toBe(difficultyOf(id) === null);
    }
    expect(DIFFICULTIES.map((d) => warlordPool(d).length)).toEqual([4, 5, 7]);
    // the 13 keep their slots and luck exactly
    expect(RIVAL_IDS.slice(0, 13).map((id) => `${difficultyOf(id)}/${luckOf(id)}`)).toEqual([
      "medium/ordinary", "easy/ordinary", "easy/ordinary", "hard/good", "medium/ordinary", "medium/ordinary", "easy/ordinary",
      "medium/ordinary", "hard/good", "hard/good", "hard/good", "hard/good", "hard/stars",
    ]);
  });

  it("every blurb fits the road stop like today's (at most 41 characters); the six carry the brief's picks", () => {
    for (const id of RIVAL_IDS) expect(RIVALS[id].blurb.length, `${id}: ${RIVALS[id].blurb}`).toBeLessThanOrEqual(41);
    expect(SIX.map((id) => RIVALS[id].blurb)).toEqual([
      "MIRRORED BELTS, GAUGED. EVERY POUR FUSES.", "LATCHED IN STEP. EVERY PAIR HITS HARDER.", "THICK PLATE MAKES EVERY SHOT HIT HARDER.",
      "A WALL OF PLATE. HE BREAKS IT ON YOU.", "LATCHED BELTS. HIS SLUGS LAND IN PAIRS.", "THREADS PLATE HER. PLATED, HER GUNS SPIN.",
    ]);
  });

  it("each names D1's synergy parts in D1's order", () => {
    expect(Object.fromEntries(SIX.map((id) => [id, PLANS[id].synergy]))).toEqual({
      brasswick: ["twingauge", "twinmould", "twintrigger"], voss: ["twinlatch", "twintrigger", "compound"],
      grimhold: ["plateroller", "anvil", "spallcatcher"],
      // D1's three first, in D1's order, then his stand-in's PLATE ROLLER and SPALL CATCHER (oracles ae44c7db19da0dc0, cf201b9918116576);
      // bb-0.8.6 (job PACKS run 2; oracle 47d683ef9b959301 (1)): D1's ARMOR PRESS left his plan under bb-0.8.6's caps
      karsk: ["shieldwall", "platebreaker", "plateroller", "spallcatcher"],
      lockjaw: ["twinlatch", "twinmould", "twingauge"], thistlemail: ["plateroller", "steambreech", "spallcatcher"],
    });
  });
});

describe("the road and the stand-ins over 2,000 run seeds (0.8.0 N1)", () => {
  it("LOCKJAW and THISTLEMAIL are never offered on the road (with or without the Matriarch beaten), and all 18 stand in", () => {
    const offered = new Set<RivalId>(), stood = new Set<RivalId>();
    for (const seed of SEEDS) {
      for (const o of warlordOffers(seed)) for (const id of Object.values(o)) offered.add(id);
      for (const beaten of [8, 9]) for (let day = beaten + 1; day <= RUN_DAYS; day++) offered.add(warlordOffer(seed, day, beaten).hard);
      for (const id of standInGhosts(seed)) stood.add(id);
    }
    expect([...offered].sort()).toEqual(RIVAL_IDS.filter((id) => !RIVALS[id].standInOnly).sort());
    expect([...stood].sort()).toEqual(RIVAL_IDS.filter((id) => id !== "matriarch").sort());
    expect(stood.size).toBe(18);
  });

  it("no captain stands in twice in a run, none on a day it is offered, and no slot offers one captain two days running", () => {
    for (const seed of SEEDS) {
      const s = standInGhosts(seed), offers = warlordOffers(seed);
      expect(new Set(s).size, `seed ${seed}`).toBe(RUN_DAYS);
      DAYS.forEach((day) => {
        expect(Object.values(offers[day - 1]), `seed ${seed} day ${day}`).not.toContain(s[day - 1]);
        if (day > 1) for (const slot of DIFFICULTIES) {
          const id = offers[day - 1][slot];
          if (id !== "matriarch") expect(offers[day - 2][slot], `seed ${seed} day ${day} ${slot}`).not.toBe(id);
        }
      });
      // after the Matriarch is beaten (day 8 or 9), the Hard slot's replacement is never that day's stand-in nor yesterday's
      for (const beaten of [8, 9]) for (let day = beaten + 1; day <= RUN_DAYS; day++) {
        const hard = warlordOffer(seed, day, beaten).hard, before = warlordOffer(seed, day - 1, beaten).hard;
        expect([hard === s[day - 1], hard === before], `seed ${seed} beaten ${beaten} day ${day}`).toEqual([false, false]);
      }
    }
  });

  it("Q12: every road captain averages at least one offer a run; each Hard captain is offered exactly once on days 1-7, so MASTER VOSS stays Hard", () => {
    // VERIFIED-D1 Q12: if a Hard captain averaged under 1.0 offers a run, MASTER VOSS would move to Medium (tier 2). The
    // Hard pool of 7 is one shuffle on days 1-7, so the rule cannot fire; beating the Matriarch on day 8 or 9 only adds
    // Hard offers (output-N1/m4/q12.md: 1.27-1.30 and 1.14-1.15 a run).
    const road = RIVAL_IDS.filter((id) => id !== "matriarch" && difficultyOf(id) !== null);
    const mean = (offers: (seed: number) => RivalId[]) => {
      const n = new Map<RivalId, number>();
      for (const seed of SEEDS) for (const id of offers(seed)) n.set(id, (n.get(id) ?? 0) + 1);
      return (id: RivalId) => (n.get(id) ?? 0) / SEEDS.length;
    };
    for (const seed of SEEDS) {
      const days17 = warlordOffers(seed).slice(0, MATRIARCH_DAY - 1).map((o) => o.hard);
      expect([...days17].sort(), `seed ${seed}`).toEqual([...warlordPool("hard")].sort());
    }
    const unbeaten = mean((seed) => warlordOffers(seed).flatMap((o) => Object.values(o)));
    for (const id of road) expect(unbeaten(id), id).toBeGreaterThanOrEqual(difficultyOf(id) === "hard" ? 1 : 2);
    for (const id of warlordPool("hard")) expect(unbeaten(id), id).toBe(1);
    for (const beaten of [8, 9]) {
      const after = mean((seed) => DAYS.map((day) => warlordOffer(seed, day, beaten).hard));
      for (const id of warlordPool("hard")) expect(after(id), `${id}, the Matriarch beaten on day ${beaten}`).toBeGreaterThan(1);
    }
  });
});

describe("each captain's own hero's luck caps (0.8.0 N1 M1, VERIFIED-D1 Q11)", () => {
  // captains.luck checks every captain against LUCK_CAPS.caps[its hero] and re-fingerprints the par runs of LUCK_HEROES
  // only. So a hero dropped from LUCK_HEROES would leave its committed rows unchecked for staleness (N1 mutant
  // c2-luck-heroes-no-foundry survived until this test): the caps are measured on every playable hero, and the table's
  // fingerprints and rows cover exactly those heroes.
  it("are measured on all four playable heroes, and the committed table covers exactly them", () => {
    const sorted = (xs: readonly string[]) => [...xs].sort();
    expect(sorted(LUCK_HEROES)).toEqual(sorted(PLAYABLE_HEROES));
    expect(sorted(Object.keys(LUCK_CAPS.fingerprint))).toEqual(sorted(LUCK_HEROES));
    expect(sorted(Object.keys(LUCK_CAPS.caps))).toEqual(sorted(LUCK_HEROES));
    for (const h of LUCK_HEROES) expect(LUCK_CAPS.caps[h]?.length, h).toBe(RUN_DAYS);
    for (const id of RIVAL_IDS) expect(LUCK_HEROES, id).toContain(RIVALS[id].hero);
  });
});

describe("the Hard prizes stay inside today's economy (0.8.0 N1, oracle 94b9559fbb7da299 (9))", () => {
  // src/net/roadCap.ts reads every captain warlordPool("hard") holds: a Hard win pays the 1-star value of the priciest
  // part it offers (road.ts warlordReward, hardParts of the fought deck). The two new Hard captains never offer a pricier
  // part than today's best on the same day, with or without a SABOTAGE, so the upload ceiling (net-upload.test pins
  // roadCap) does not move.
  const BASE_HARD: RivalId[] = ["mothqueen", "bulwark", "silkshade", "longtooth", "highspire"];
  const part = (id: RivalId, day: number, sab: boolean) => {
    const r = warlordReward(id, "hard", warlordDeck(id, day, sab), warlordDeckDay(id, day, sab), day);
    return Math.max(0, ...r.parts.map((p) => valueOf(p, 1)));
  };
  it("MASTER VOSS's and THANE KARSK's prizes never beat the best of the five other Hard captains on any day", () => {
    const best = DAYS.map((day) => Math.max(...BASE_HARD.flatMap((id) => [false, true].map((sab) => part(id, day, sab)))));
    expect(best).toEqual([5, 6, 6, 6, 7, 7, 7, 10, 10, 10]);
    for (const id of ["voss", "karsk"] as RivalId[]) for (const day of DAYS) for (const sab of [false, true]) {
      expect(part(id, day, sab), `${id} day ${day}${sab ? " sabotaged" : ""}`).toBeLessThanOrEqual(best[day - 1]);
      expect(warlordReward(id, "hard", warlordDeck(id, day, sab), warlordDeckDay(id, day, sab), day).parts.length, `${id} d${day}`).toBe(2);
    }
  });
});

// ------------------------------------------------------------------ saves written before N1

interface OldSave { hero: HeroId; seed: number; label: "fork" | "warlord" | "dusk" | "dawn"; day: number; json: string; fork: Record<string, RivalId>; standIn: RivalId; standInNext: RivalId; warlord?: RivalId; dusk?: RivalId }
const OLD = JSON.parse(readFileSync(new URL("./fixtures/n1-oldsaves-base.json", import.meta.url), "utf8")) as { base: string; saves: OldSave[] };

/** heroes.playable's simple player: buys what it can afford and place. */
function shop(run: Run): void {
  run.shop.wagons.forEach((w, wi) => w.offers.forEach((o, si) => {
    if (o.sold || o.price > run.gold) return;
    const d = ITEMS[o.def];
    if (d.kind === "gate") {
      const s = bestSpot(run.build, o.def);
      if (s && s.hits.length) buyOffer(run, wi, si, { x: s.x, y: s.y, rot: s.rot });
    } else if (d.kind === "mod") {
      const t = installedTurrets(run.build).find((v) => canFitGear(run.build, v.slot, o.def).ok);
      if (t) buyOffer(run, wi, si, { turret: t.slot });
    } else if (d.kind === "core") {
      const t = installedTurrets(run.build).find((v) => !coreFor(run.build, v.slot));
      if (t) buyOffer(run, wi, si, { turret: t.slot });
    } else if (d.kind === "turret") {
      const empty = turretSlots(run.build).find((v) => !v.turret);
      const r = empty ? buyOffer(run, wi, si) : null;
      const uid = r?.ok ? r.gain?.survivor : undefined;
      if (empty && uid !== undefined && run.inventory.some((i) => i.uid === uid)) installFromCargo(run, uid, empty.slot);
    } else buyOffer(run, wi, si);
  }));
}

/** Play a loaded run on to its end with the game's own day loop; returns the days played and each dusk's stand-in. */
function playOn(run: Run, seed: number): { days: number; standIns: RivalId[]; offers: RivalId[][] } {
  const out = { days: 0, standIns: [] as RivalId[], offers: [] as RivalId[][] };
  for (let guard = 0; guard < RUN_DAYS + 1 && !run.over; guard++) {
    if (!roadChosen(run)) {
      shop(run);
      out.offers.push(Object.values(forkFor(run).warlords));
      const pick = (["event", "easy", "medium", "hard"] as const)[hashSeed(seed, run.hero, run.day, "n1-play") % 4];
      expect(pickRoad(run, pick).ok).toBe(true);
      if (pick === "event") pickChoice(run, Math.max(0, choicesFor(run).findIndex((c) => !c.blocked)));
    }
    const w = todaysWarlord(run);
    if (w && !w.result) {
      const b = simulate(run.build, w.build, warlordSeed(run));
      const res = finishWarlord(run, b.winner as 0 | 1 | -1, b.t);
      if (res?.outcome === "win" && w.tier === "hard") takePart(run, 0);
    }
    const foe = startDusk(run, []);
    if (foe.kind === "standin") out.standIns.push(foe.rival as RivalId);
    const b = simulate(run.build, foe.build, battleSeed(run));
    finishDay(run, run.day <= 3 ? 0 : (b.winner as 0 | 1 | -1), b.t, b.sides[0].stats, b.sides[1].stats);
    out.days++;
  }
  return out;
}

describe("saves written before N1 still load and play (tests/fixtures/n1-oldsaves-base.json: BASE 9855129's own runs)", () => {
  it("load as saved, keep what they stored (today's warlord fight, tonight's foe), and play to the run's end with the new roster", () => {
    expect(OLD.base).toBe("9855129");
    expect(OLD.saves.length).toBe(48);
    let forkMoved = 0, nextMoved = 0, newMet = 0;
    for (const s of OLD.saves) {
      const tag = `${s.hero} #${s.seed} ${s.label} d${s.day}`;
      const raw = JSON.parse(s.json) as Run;
      const run = migrateRun(JSON.parse(s.json))!;
      expect(run, tag).not.toBe(null);
      expect([run.hero, run.seed, run.day, run.stage, run.gold, run.lives], tag).toEqual([raw.hero, raw.seed, raw.day, raw.stage, raw.gold, raw.lives]);
      // NUM-1 (cap's oracle bcc36c430b4f3a01): the raw fixture goes through the game's own load path (save.ts v7to8), which
      // converts a pre-NUM-1 save once: every stored Build's hullBonus x10; nothing else moves
      const x10 = <B extends { hullBonus: number }>(b: B): B => ({ ...b, hullBonus: b.hullBonus * 10 });
      expect(run.version, tag).toBe(8);
      expect(run.build, tag).toEqual(x10(raw.build));
      if (s.label === "warlord") {
        // today's fight was stored when it was picked: the same captain and the same deck, whatever today's pools say
        expect(todaysWarlord(run)?.id, tag).toBe(s.warlord);
        expect(todaysWarlord(run)?.build, tag).toEqual(x10(raw.warlord!.build)); // NUM-1: converted once on load
      }
      if (s.label === "dusk") {
        // tonight's foe was stored when the dusk started: the same stand-in and deck
        const foe = startDusk(run, []);
        expect([foe.kind, foe.rival], tag).toEqual(["standin", s.dusk]);
        expect(foe.build, tag).toEqual(x10(raw.dusk!.build)); // NUM-1: converted once on load
      }
      if (s.label === "fork") {
        // nothing of today's road was stored, so the fork is the new roster's (it may differ from what BASE showed)
        expect(forkFor(run).warlords, tag).toEqual(warlordOffer(run.seed, run.day));
        if (JSON.stringify(forkFor(run).warlords) !== JSON.stringify(s.fork)) forkMoved++;
      }
      if (standInFoe(run.seed, Math.min(RUN_DAYS, run.day + 1)).id !== s.standInNext) nextMoved++;
      const p = playOn(run, s.seed);
      expect(run.over, tag).not.toBe(null);
      expect(p.days, tag).toBeGreaterThan(0);
      if ([...p.standIns, ...p.offers.flat()].some((id) => SIX.includes(id))) newMet++;
    }
    // what changes for an old save from its next day on: its road offers and its stand-ins (the run stores neither)
    expect(forkMoved).toBeGreaterThan(0);
    expect(nextMoved).toBeGreaterThan(0);
    expect(newMet).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`old saves: ${OLD.saves.length} loaded and played to the end; ${forkMoved} of 12 "fork" saves now see another fork, ${nextMoved} of 48 meet another stand-in the next day, ${newMet} meet one of the six later`);
  }, 120_000);
});
