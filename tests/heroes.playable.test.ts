// 0.8.0 H1 M2 (REQ-BFG-011, REQ-BFG-021, REQ-BFG-032): FOUNDRY and BASTION are playable. The roster and hero select;
// each hero's trick sentence from the real values; a new run starts from heroStartBuild with the extra turret slot; full
// 10-day runs through the game's own day loop (the caravan, the road's events and warlords, the dusk, save and load at
// every step, the run's end); and the dusk foes are the same hero-blind stand-ins every hero meets.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import { battleSeed, buyOffer, installFromCargo, loadRun, newRun, reroll, saveRun, type Run } from "../src/game/run";
import { finishDay, startDusk } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import { finishWarlord, forkFor, pickRoad, takePart, todaysWarlord, topParts, warlordSeed } from "../src/game/road";
import { choicesFor, pickChoice } from "../src/game/events";
import { ORDER } from "../src/screens/hero";
import { PORTRAIT_KEYS } from "../src/render/portraits";
import { SIM, heroTrick } from "../src/ui/abilityText";
import { FURNACE_LONG_BELT, simulate } from "../src/sim/battle";
import { bestSpot } from "../src/sim/beltside";
import { AMMO, FRAY_BONUS, FRAY_MAX, HEROES, ITEMS, RUN_DAYS, type HeroId } from "../src/sim/content";
import { canFitGear, coreFor, installedTurrets, turretSlots } from "../src/sim/deck";
import { PLAYABLE_HEROES, heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { PAR_FIELD_HEROES, parRefs, parSourceFor } from "../src/sim/harness/par";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { STAND_IN_HEROES } from "../src/net/fallback";
import { generateSamplePool } from "../tools/samplePool";
import { FUSE_MULT, SYNC_WINDOW } from "../src/sim/races/foundry";
import { PLATE_CAP, PLATE_PER_SLUG } from "../src/sim/races/bastion";
import { validateBuild } from "../src/net/validate";
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
    expect(num(T.furnace)).toEqual([AMMO.cinder.rideScale, SIM.furnaceLongTiles, Math.round((1 / FURNACE_LONG_BELT - 1) * 100)]);
    expect(num(T.weaver)).toEqual([ITEMS.loom.factory!.outputs, FRAY_BONUS, FRAY_MAX]);
    expect(num(T.foundry)).toEqual([SYNC_WINDOW, FUSE_MULT]);
    expect(num(T.bastion)).toEqual([PLATE_PER_SLUG, PLATE_CAP]);
    expect(T.foundry).toBe("ITS CRUCIBLE POURS A BLANK ONTO BOTH ITS BELTS AT ONCE, AND TWO BLANKS THAT REACH ONE GUN WITHIN 0.25 SECONDS FUSE INTO ONE SLUG WITH 1.15 TIMES THEIR DAMAGE.");
    expect(T.bastion).toBe("ITS BULWARK SLUGS PLATE YOUR HULL AS THEY LOAD, 2 EACH UP TO 24 PLATING, AND PLATING TAKES HITS AND BURN BEFORE YOUR HULL DOES.");
    // the FURNACE breech's 8 tiles are battle.ts's own threshold (makeTurret: `< 8` means no long belt)
    expect(readFileSync(new URL("../src/sim/battle.ts", import.meta.url), "utf8")).toMatch(/journeyTiles\(b, ri\)\) < 8\) return false;/);
    expect(ITEMS.crucible.factory!.outputs).toBe(2); // "BOTH ITS BELTS"
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

/** One seeded run of `hero` through the game's day loop, a save/load round trip at every step. `scripted`: a scripted
 *  outcome instead of the fight's (at most 3 losses), so the run reaches day 10; the fight is still simulated. */
function play(hero: HeroId, seed: number, scripted: boolean): Played {
  let run = newRun(hero, hashSeed("h1-play", seed), `h1-play-${hero}-${seed}`);
  const out: Played = { run, dusks: 0, buys: 0, events: 0, warlords: 0, foes: [] };
  let losses = 0;
  for (let guard = 0; guard < RUN_DAYS && !run.over; guard++) {
    run = roundTrip(run); // dawn
    if (hashSeed(seed, run.day, "h1-reroll") % 3 === 0 && run.gold >= 4) reroll(run);
    out.buys += shop(run);
    run = roundTrip(run); // after the caravan
    const pick = (["event", "easy", "medium", "hard"] as const)[hashSeed(seed, hero, run.day, "h1-road") % 4];
    expect(forkFor(run).day).toBe(run.day);
    expect(pickRoad(run, pick).ok).toBe(true);
    if (pick === "event") {
      const i = choicesFor(run).findIndex((c) => !c.blocked);
      expect(pickChoice(run, i).ok).toBe(true);
      out.events++;
    } else {
      const w = todaysWarlord(run)!;
      const b = simulate(run.build, w.build, warlordSeed(run));
      const res = finishWarlord(run, b.winner as 0 | 1 | -1, b.t);
      if (res?.outcome === "win" && pick === "hard") takePart(run, 0);
      out.warlords++;
    }
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
  expect(loadRun()).toBe(null);
  out.run = run;
  return out;
}

describe("full 10-day runs with FOUNDRY and BASTION", () => {
  let saved: unknown;
  beforeAll(() => {
    saved = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = memStorage();
  });
  afterAll(() => {
    (globalThis as { localStorage?: unknown }).localStorage = saved;
  });

  for (const hero of ["foundry", "bastion"] as const) {
    it(`${hero.toUpperCase()}: 20 runs play every day to the run's end (caravan, road, dusk, save and load at every step)`, () => {
      let complete = 0, lost = 0, dusks = 0, buys = 0, events = 0, warlords = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const p = play(hero, seed, seed % 2 === 0);
        expect(p.run.over, `${hero} #${seed}`).not.toBe(null);
        if (p.run.over === "complete") complete++;
        else lost++;
        dusks += p.dusks;
        buys += p.buys;
        events += p.events;
        warlords += p.warlords;
        if (seed % 2 === 0) expect(p.run.over, `${hero} #${seed} (scripted)`).toBe("complete");
        expect(p.run.hero).toBe(hero);
        expect(p.run.build.items.filter((x) => x.def === HEROES[hero].factory), `${hero} #${seed}: the signature stays aboard`).toHaveLength(1);
      }
      expect(complete).toBeGreaterThanOrEqual(10);
      expect(dusks).toBeGreaterThan(150);
      expect(buys).toBeGreaterThan(100);
      expect(events).toBeGreaterThan(10);
      expect(warlords).toBeGreaterThan(20);
      console.log(`${hero}: 20 runs, ${complete} complete, ${lost} lost, ${dusks} dusks, ${buys} buys, ${events} events, ${warlords} warlord fights`);
    }, 300_000);
  }

  it("the dusk foes are hero-blind: a FOUNDRY and a BASTION run meet exactly the stand-ins a FURNACE run of the same seed meets", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const [fu, fo, ba] = (["furnace", "foundry", "bastion"] as const).map((h) => play(h, seed, true).foes.map((f) => f.split(":").slice(0, 4).join(":")));
      expect(fo, `seed ${seed}`).toEqual(fu);
      expect(ba, `seed ${seed}`).toEqual(fu);
      expect(fu).toHaveLength(RUN_DAYS);
    }
  }, 300_000);
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

  it("the stand-in heroes and the seed ghosts' heroes stay FURNACE and WEAVER", () => {
    expect([...STAND_IN_HEROES]).toEqual(["furnace", "weaver"]);
    expect(new Set(generateSamplePool().map((g) => g.hero))).toEqual(new Set(["furnace", "weaver"]));
  });
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
