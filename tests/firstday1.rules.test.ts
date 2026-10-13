// FIRSTDAY-1 (REQ-BFG-004, REQ-BFG-084.4; BRIEF-FIRSTDAY1 F1-F3, step 3): a new player's first run is gated, behind
// FIRST_RUN (src/sim/firstRun.ts). Off (or with PLAIN_RIGS off) nothing changes. On: the profile rule (profile.ts
// isNewPlayer), the run flag and its reload, dawn 1-2's rune offers (runes.ts firstRunRuneOffer), dawn 1-2's caravans and
// rerolls (run.ts firstRunCaravan) across many seeds, the guided merge (dawn 2's copy of the first rig bought on day 1),
// and from day 3 the offers of a normal run with the same seed and the same buys.
import { describe, expect, it } from "vitest";
import { ITEMS, type HeroId } from "../src/sim/content";
import {
  SAVE_KEY, SAVE_KEY_V3, SAVE_KEY_V4, SAVE_KEY_V5, SAVE_KEY_V6, buyOffer, firstRunGated, firstRunGear, firstRunOwnPieces,
  migrateRun, newRun, pendingRune, reroll, sellInventory, shopBadge, takeRune, type Run,
} from "../src/game/run";
import { mergePreview } from "../src/game/fuse"; // FIRSTDAY-1 Q4 (PLAIN-1F M2): the copy only while it would merge
import { finishDay } from "../src/game/day";
import { FIRST_RUN, FIRST_RUN_COMMONS, FIRST_RUN_RUNES, firstRunGate, firstRunRules, withFirstRun } from "../src/sim/firstRun";
import { PLAIN_RIG_IDS, withPlainRigs } from "../src/sim/plainRigs";
import { openRunesRules } from "../src/sim/openRunes"; // PLAIN-1F (M1): c099's dawn offers read OPEN-1's rule (run.ts pendingRune)
import { RUNES, RUNE_LIST, dawnRuneOffer, firstRunBarred, firstRunRuneOffer, runeFits, runeOffer, runeProblem } from "../src/sim/runes";
import { FIRST_RUN_SAVE_KEYS, PROFILE_KEY, SEED_GHOST_KEY, SEED_RUNS_KEY, emptyProfile, isNewPlayer } from "../src/game/profile";

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
/** The gate live: PLAIN_RIGS and FIRST_RUN on. */
const both = <T>(fn: () => T): T => withPlainRigs(() => withFirstRun(fn));
const stats = { shots: 0, damage: 0, firstShot: -1, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
const dusk = (run: Run) => finishDay(run, 0, 10, stats, stats);
const offers = (run: Run) => run.shop.wagons.flatMap((w) => w.offers.map((o) => o.def));
const shape = (run: Run) => run.shop.wagons.map((w) => `${w.merchant}:${w.offers.length}`);
/** An in-memory Storage (profile.ts reads getItem only). */
const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, v) };
};
/** Every offer of a first run's day 1-2 caravan is a plain common or one of the hero's own pieces (or, on day 2, the
 *  gear or the copy); no part twice; the base's price rule. */
function gatedOk(run: Run, extras: string[] = []): void {
  const own = firstRunOwnPieces(run);
  const seen = new Set<string>();
  for (const w of run.shop.wagons) {
    for (const o of w.offers) {
      expect(FIRST_RUN_COMMONS.includes(o.def) || own.has(o.def) || extras.includes(o.def), `${run.hero} ${run.seed} d${run.day}: ${o.def}`).toBe(true);
      expect(seen.has(o.def), `${o.def} twice`).toBe(false);
      seen.add(o.def);
      expect(o.price).toBe(Math.max(1, ITEMS[o.def].price - (run.shop.discount || 0)));
      expect(o.sold).toBe(false);
    }
  }
}

describe("F1: the switch, off by default; off (or PLAIN_RIGS off) a first run is a normal run", () => {
  it("FIRST_RUN is false; firstRunGate needs both switches", () => {
    expect(FIRST_RUN).toBe(false);
    expect(firstRunRules()).toBe(false);
    expect(firstRunGate()).toBe(false);
    expect(withFirstRun(() => firstRunGate())).toBe(false); // PLAIN_RIGS off
    expect(withPlainRigs(() => firstRunGate())).toBe(false); // FIRST_RUN off
    expect(both(() => firstRunGate())).toBe(true);
    expect(firstRunRules()).toBe(false); // put back
  });

  it("asking for a first run with the gate off gives the normal run, byte for byte (its save, caravan and rune offer)", () => {
    for (const hero of HEROES) {
      for (const seed of [1, 2, 77, 2026, 31337]) {
        const normal = JSON.stringify(newRun(hero, seed, "r"));
        expect(JSON.stringify(newRun(hero, seed, "r", true))).toBe(normal); // both off
        expect(withFirstRun(() => JSON.stringify(newRun(hero, seed, "r", true)))).toBe(normal); // PLAIN_RIGS off
        withPlainRigs(() => {
          const plain = JSON.stringify(newRun(hero, seed, "r"));
          expect(JSON.stringify(newRun(hero, seed, "r", true))).toBe(plain); // FIRST_RUN off
          expect(withFirstRun(() => JSON.stringify(newRun(hero, seed, "r")))).toBe(plain); // gate on, not asked
        });
        const run = newRun(hero, seed, "r", true);
        expect(run.firstRun).toBeUndefined();
        // PLAIN-1F (M1): re-pinned by cause, OPEN_RUNES' offers: c099's pendingRune reads runeOffer(..., openRunesRules());
        // dawnRuneOffer takes OPEN-1's `open` 5th and the first-run flag 6th
        expect(pendingRune(run)).toEqual(runeOffer(seed, 1, hero, [], openRunesRules()));
        expect(dawnRuneOffer(seed, 1, hero, [], openRunesRules(), true)).toEqual(runeOffer(seed, 1, hero, [], openRunesRules())); // gate off
      }
    }
  });
});

describe("F2: who gets a first run (profile.ts isNewPlayer), and the flag across a reload", () => {
  it("new: nothing stored, an empty profile, an empty pool and no online runs", () => {
    expect(isNewPlayer(mem())).toBe(true);
    expect(isNewPlayer(mem({ [PROFILE_KEY]: JSON.stringify(emptyProfile()) }))).toBe(true);
    expect(isNewPlayer(mem({ [PROFILE_KEY]: JSON.stringify(emptyProfile()), [SEED_GHOST_KEY]: "[]", [SEED_RUNS_KEY]: JSON.stringify({ runs: 0, last: 0 }) }))).toBe(true);
  });

  it("old: any record of a run (counters, best, heroes, folds, the pool, online runs, a run in progress) is never new", () => {
    const withP = (f: (p: ReturnType<typeof emptyProfile>) => void) => {
      const p = emptyProfile();
      f(p);
      return mem({ [PROFILE_KEY]: JSON.stringify(p) });
    };
    expect(isNewPlayer(withP((p) => { p.counters.runs = 1; }))).toBe(false);
    expect(isNewPlayer(withP((p) => { p.counters.runsFinished = 1; }))).toBe(false);
    expect(isNewPlayer(withP((p) => { p.counters.bestDay = 3; }))).toBe(false);
    expect(isNewPlayer(withP((p) => { p.counters.duskWins = 1; }))).toBe(false);
    expect(isNewPlayer(withP((p) => { p.heroesWon = ["furnace"]; }))).toBe(false);
    expect(isNewPlayer(withP((p) => { p.heroesFinished = ["weaver"]; }))).toBe(false);
    expect(isNewPlayer(withP((p) => { p.folded = ["abc:1"]; }))).toBe(false);
    expect(isNewPlayer(mem({ [SEED_GHOST_KEY]: JSON.stringify([{ runId: "x", hero: "furnace", day: 2, wins: 1 }]) }))).toBe(false);
    expect(isNewPlayer(mem({ [SEED_RUNS_KEY]: JSON.stringify({ runs: 2, last: 0 }) }))).toBe(false);
    for (const k of FIRST_RUN_SAVE_KEYS) expect(isNewPlayer(mem({ [k]: "{}" })), k).toBe(false);
  });

  it("can't tell: no storage, an unreadable value, a newer profile: not new", () => {
    expect(isNewPlayer(null)).toBe(false); // no localStorage in the test environment
    expect(isNewPlayer(mem({ [PROFILE_KEY]: "{" }))).toBe(false);
    expect(isNewPlayer(mem({ [PROFILE_KEY]: "[]" }))).toBe(false);
    expect(isNewPlayer(mem({ [PROFILE_KEY]: JSON.stringify({ ...emptyProfile(), v: 2 }) }))).toBe(false);
    expect(isNewPlayer(mem({ [SEED_GHOST_KEY]: "not json" }))).toBe(false);
    expect(isNewPlayer(mem({ [SEED_GHOST_KEY]: "{}" }))).toBe(false);
    expect(isNewPlayer(mem({ [SEED_RUNS_KEY]: "[1]" }))).toBe(false);
    expect(isNewPlayer({ getItem: () => { throw new Error("denied"); }, setItem: () => undefined })).toBe(false);
  });

  it("the save keys it reads are save.ts's", () => {
    expect(FIRST_RUN_SAVE_KEYS).toEqual([SAVE_KEY, SAVE_KEY_V6, SAVE_KEY_V5, SAVE_KEY_V4, SAVE_KEY_V3]);
  });

  it("the run carries firstRun: true; a reload mid-run keeps it, its offers and its first rig; every later run is normal", () => both(() => {
    const run = newRun("furnace", 4242, "r", true);
    expect(run.firstRun).toBe(true);
    expect(firstRunGated(run)).toBe(true);
    const at = offers(run).findIndex((d) => ITEMS[d].kind === "gate");
    expect(at).toBeGreaterThanOrEqual(0);
    const flat = run.shop.wagons.flatMap((w, wi) => w.offers.map((_, oi) => [wi, oi] as const));
    expect(buyOffer(run, flat[at][0], flat[at][1]).ok).toBe(true);
    expect(run.firstRig).toBe(offers(run)[at]);
    const back = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(back.firstRun).toBe(true);
    expect(back.firstRig).toBe(run.firstRig);
    expect(back.shop).toEqual(run.shop);
    expect(pendingRune(back)).toEqual(pendingRune(run));
    expect(pendingRune(back)!.ids).toEqual(FIRST_RUN_RUNES);
    // a malformed flag or rig is dropped (the run is then normal)
    const bad = migrateRun({ ...JSON.parse(JSON.stringify(run)), firstRun: "yes", firstRig: 7 })!;
    expect(bad.firstRun).toBeUndefined();
    expect(bad.firstRig).toBeUndefined();
    // the next run: a run save exists (and later the profile's counters), so the player is not new
    expect(isNewPlayer(mem({ [SAVE_KEY]: JSON.stringify(run) }))).toBe(false);
    expect(newRun("furnace", 4242, "r2", false).firstRun).toBeUndefined();
    // a normal run's save holds neither field
    const normal = JSON.stringify(newRun("furnace", 4242, "r"));
    expect(normal.includes("firstRun")).toBe(false);
    expect(normal.includes("firstRig")).toBe(false);
  }));
});

describe("F3: dawn 1 and dawn 2's rune offers", () => {
  it("the barred runes (VOLLEY, MERGED, STAMP) are these six", () => {
    expect(RUNE_LIST.filter((d) => firstRunBarred(d.id)).map((d) => d.id).sort()).toEqual(["ember_shot", "final_nail", "first_blood", "forge_ward", "scrap_halo", "scrap_saint"]);
  });

  it("dawn 1: IRON SKIN, TAR BARREL and COIN PURSE, whatever the seed offered; every hero can take each", () => both(() => {
    expect(FIRST_RUN_RUNES.map((id) => RUNES[id].name)).toEqual(["IRON SKIN", "TAR BARREL", "COIN PURSE"]);
    for (const hero of HEROES) {
      for (const id of FIRST_RUN_RUNES) expect(runeFits(RUNES[id], hero), `${hero} ${id}`).toBe(true);
      for (let seed = 1; seed <= 120; seed++) {
        const run = newRun(hero, seed, "r", true);
        const o = pendingRune(run)!;
        expect(o.ids).toEqual(FIRST_RUN_RUNES);
        expect(o.tier).toBe("common");
        expect(o.drawn).toBe(runeOffer(seed, 1, hero, []).drawn);
      }
    }
  }));

  it("dawn 2: the seed's offer, each VOLLEY, MERGED or STAMP card replaced in place by an allowed rune; no barred rune before day 3", () => both(() => {
    let replaced = 0, total = 0;
    for (const hero of HEROES) {
      for (let seed = 1; seed <= 400; seed++) {
        for (const held of FIRST_RUN_RUNES) {
          const base = runeOffer(seed, 2, hero, [held]);
          const o = firstRunRuneOffer(seed, 2, hero, [held]);
          total++;
          expect(o.tier).toBe(base.tier);
          expect(o.ids.length).toBe(base.ids.length);
          expect(new Set(o.ids).size).toBe(o.ids.length);
          for (let i = 0; i < base.ids.length; i++) {
            expect(firstRunBarred(o.ids[i])).toBe(false);
            expect(o.ids[i]).not.toBe(held);
            expect(RUNES[o.ids[i]].tier).toBe(base.tier);
            if (!firstRunBarred(base.ids[i])) expect(o.ids[i]).toBe(base.ids[i]);
          }
          if (base.ids.some(firstRunBarred)) {
            replaced++;
            expect(o.ids.some((id) => runeFits(RUNES[id], hero))).toBe(true);
          } else expect(o).toEqual(base);
        }
      }
    }
    expect(replaced).toBeGreaterThan(100); // FINAL NAIL and SCRAP HALO are common: they show on many day-2 offers
    console.log(`FIRSTDAY1 dawn 2: ${replaced} of ${total} seed offers held a barred rune, each replaced`);
  }), 180_000);

  it("in the run: the dawn 2 pick is the first run's offer; from day 3 every offer is runeOffer's", () => both(() => {
    for (const hero of HEROES) {
      for (const seed of [3, 18, 555]) {
        const run = newRun(hero, seed, "r", true);
        expect(takeRune(run, "tar_barrel").ok).toBe(true);
        dusk(run);
        expect(run.day).toBe(2);
        expect(pendingRune(run)).toEqual(firstRunRuneOffer(seed, 2, hero, ["tar_barrel"]));
        const pick2 = pendingRune(run)!.ids[0];
        expect(takeRune(run, pick2).ok).toBe(true);
        dusk(run);
        for (let day = 3; day <= 6; day++) {
          const held = run.build.runes!.map((q) => q.id);
          expect(pendingRune(run)).toEqual(runeOffer(seed, day, hero, held, openRunesRules())); // PLAIN-1F (M1): OPEN_RUNES' offers (c099)
          expect(takeRune(run, pendingRune(run)!.ids[0]).ok).toBe(true);
          dusk(run);
        }
        // the deck's runes pass the shared check with the flag (the client's and the server's rule), not without it
        // PLAIN-1F (M1): runeProblem takes OPEN-1's `open` 8th (the offer rule the run played under) and the flag 9th
        expect(runeProblem(run.build.runes, run.day - 1, hero, seed, "atMost", false, -1, openRunesRules(), true)).toBeNull();
        const without = runeProblem(run.build.runes, run.day - 1, hero, seed, "atMost", false, -1, openRunesRules(), false);
        if (!runeOffer(seed, 1, hero, [], openRunesRules()).ids.includes("tar_barrel")) expect(without).toMatch(/was not offered at the dawn of day 1/);
      }
    }
  }));
});

describe("F3: dawn 1 and dawn 2's caravans, across many seeds", () => {
  it("dawn 1: only plain commons and the hero's own pieces; the base's wagons, merchants and slot counts; rerolls stay gated", () => both(() => {
    let own = 0, plainSeen = new Set<string>();
    for (const hero of HEROES) {
      for (let seed = 1; seed <= 150; seed++) {
        const run = newRun(hero, seed, "r", true);
        const base = newRun(hero, seed, "r");
        expect(shape(run)).toEqual(shape(base));
        gatedOk(run);
        for (const d of offers(run)) {
          if (firstRunOwnPieces(run).has(d) && !FIRST_RUN_COMMONS.includes(d)) own++;
          plainSeen.add(d);
          if (!firstRunOwnPieces(run).has(d)) expect(["core", "turret", "mod"].includes(ITEMS[d].kind), d).toBe(false);
        }
        // rerolls draw from the same gated set (the base run rerolled alongside: the same wagons and slots)
        run.gold = 50;
        base.gold = 50;
        const before = JSON.stringify(run.shop.wagons);
        let moved = false;
        for (let k = 0; k < 3; k++) {
          expect(reroll(run)).toBe(true);
          expect(reroll(base)).toBe(true);
          expect(shape(run)).toEqual(shape(base));
          gatedOk(run);
          moved ||= JSON.stringify(run.shop.wagons) !== before;
        }
        expect(moved).toBe(true);
      }
    }
    for (const id of FIRST_RUN_COMMONS) expect(plainSeen.has(id), id).toBe(true);
    console.log(`FIRSTDAY1 dawn 1: the hero's own (non-plain) pieces kept in ${own} offers over 600 caravans`);
  }), 180_000);

  it("dawn 2: the gear (HOPPER for every hero) once, the other slots by dawn 1's rule; no excluded card in any reroll", () => both(() => {
    for (const hero of HEROES) {
      expect(firstRunGear(newRun(hero, 1, "r", true))).toBe("hopper");
      for (let seed = 1; seed <= 100; seed++) {
        const run = newRun(hero, seed, "r", true);
        expect(takeRune(run, "iron_skin").ok).toBe(true);
        dusk(run);
        expect(run.day).toBe(2);
        expect(firstRunGated(run)).toBe(true);
        gatedOk(run, ["hopper"]);
        expect(offers(run).filter((d) => d === "hopper").length).toBe(1);
        run.gold = 50;
        for (let k = 0; k < 2; k++) {
          expect(reroll(run)).toBe(true);
          gatedOk(run, ["hopper"]);
          expect(offers(run).filter((d) => d === "hopper").length).toBe(1);
        }
      }
    }
  }), 180_000);

  it("the guided merge: a rig bought on day 1 shows again on dawn 2 with the MERGE ★2 badge; with no rig bought, no copy is added", () => both(() => {
    let copies = 0;
    for (const hero of HEROES) {
      for (let seed = 1; seed <= 60; seed++) {
        const run = newRun(hero, seed, "r", true);
        const none = newRun(hero, seed, "r", true);
        const flat = run.shop.wagons.flatMap((w, wi) => w.offers.map((o, oi) => ({ wi, oi, def: o.def })));
        const rig = flat.find((s) => ITEMS[s.def].kind === "gate" && PLAIN_RIG_IDS.concat(FIRST_RUN_COMMONS).includes(s.def))!;
        expect(rig, `${hero} ${seed}: a plain rig on dawn 1`).toBeDefined();
        expect(buyOffer(run, rig.wi, rig.oi).ok).toBe(true);
        expect(run.firstRig).toBe(rig.def);
        for (const r of [run, none]) {
          expect(takeRune(r, "coin_purse").ok).toBe(true);
          dusk(r);
        }
        expect(offers(run).includes(rig.def), `${hero} ${seed}: the copy of ${rig.def}`).toBe(true);
        expect(shopBadge(run, rig.def)).toEqual({ kind: "merge", toStars: 2 });
        gatedOk(run, ["hopper", rig.def]);
        copies++;
        // not otherwise: no first rig, and every MERGE badge on its caravan is a starting copy's (one of the hero's own)
        expect(none.firstRig).toBeUndefined();
        for (const d of offers(none)) if (shopBadge(none, d)?.kind === "merge") expect(firstRunOwnPieces(none).has(d), d).toBe(true);
        // a rig bought on day 2 is never the first rig
        const day2 = run.shop.wagons.flatMap((w, wi) => w.offers.map((o, oi) => ({ wi, oi, def: o.def }))).find((s) => ITEMS[s.def].kind === "gate" && s.def !== rig.def);
        run.gold = 50;
        if (day2) expect(buyOffer(run, day2.wi, day2.oi).ok).toBe(true);
        expect(run.firstRig).toBe(rig.def);
      }
    }
    expect(copies).toBe(240);
  }), 180_000);
});

describe("FIRSTDAY-1 Q4 (REVIEW-FIRSTDAY1; PLAIN-1F M2): dawn 2's copy of the first rig only while buying it would merge", () => {
  /** The run as it would be with no first rig (a JSON copy, as a reload makes it): its caravans are the usual gated ones,
   *  so a run whose caravan equals this copy's got no copy, and the copy's slot took the usual plain-common refill. */
  const noFirst = (run: Run): Run => {
    const r = JSON.parse(JSON.stringify(run)) as Run;
    delete r.firstRig;
    return r;
  };
  const slots = (run: Run) => run.shop.wagons.flatMap((w, wi) => w.offers.map((o, oi) => ({ wi, oi, def: o.def })));
  /** Dawn 1's first plain rig on offer, bought into cargo: its def and the cargo item's uid (none if it merged at once). */
  const buyFirst = (run: Run) => {
    const rig = slots(run).find((s) => ITEMS[s.def].kind === "gate" && PLAIN_RIG_IDS.concat(FIRST_RUN_COMMONS).includes(s.def))!;
    const res = buyOffer(run, rig.wi, rig.oi);
    expect(res.ok).toBe(true);
    expect(run.firstRig).toBe(rig.def);
    return { def: rig.def, uid: res.item?.uid };
  };
  const toDawn2 = (...runs: Run[]) => {
    for (const r of runs) {
      expect(takeRune(r, "coin_purse").ok).toBe(true);
      dusk(r);
    }
  };

  it("sold before dawn 2: no copy (the slot is refilled as usual)", () => both(() => {
    let n = 0;
    for (const hero of HEROES) {
      for (let seed = 1; seed <= 20; seed++) {
        const run = newRun(hero, seed, "r", true);
        const rig = buyFirst(run);
        if (rig.uid === undefined) continue;
        expect(sellInventory(run, rig.uid)).toBeGreaterThan(0);
        const ref = noFirst(run);
        toDawn2(run, ref);
        expect(mergePreview(run, rig.def), `${hero} ${seed}`).toBeNull();
        expect(offers(run), `${hero} ${seed}`).toEqual(offers(ref));
        expect(run.firstRig).toBe(rig.def); // the first rig stays recorded; only its copy is gone
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(60);
  }), 120_000);

  it("merged on day 1 through a reroll: no copy", () => both(() => {
    let n = 0;
    for (const hero of HEROES) {
      for (let seed = 1; seed <= 40; seed++) {
        const run = newRun(hero, seed, "r", true);
        const rig = buyFirst(run);
        run.gold = 99;
        let again: { wi: number; oi: number } | undefined;
        for (let k = 0; k < 8 && !again; k++) {
          expect(reroll(run)).toBe(true);
          again = slots(run).find((s) => s.def === rig.def);
        }
        if (!again) continue;
        expect(mergePreview(run, rig.def)?.toStars, `${hero} ${seed}`).toBe(2); // buying it now merges
        expect(buyOffer(run, again.wi, again.oi).ok).toBe(true);
        const ref = noFirst(run);
        toDawn2(run, ref);
        expect(mergePreview(run, rig.def), `${hero} ${seed}`).toBeNull();
        expect(offers(run), `${hero} ${seed}`).toEqual(offers(ref));
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(10);
  }), 120_000);

  it("bought on day 2: a later reroll doesn't bring it back", () => both(() => {
    let n = 0;
    for (const hero of HEROES) {
      for (let seed = 1; seed <= 20; seed++) {
        const run = newRun(hero, seed, "r", true);
        const rig = buyFirst(run);
        toDawn2(run);
        const copy = slots(run).find((s) => s.def === rig.def);
        expect(copy, `${hero} ${seed}: the copy`).toBeDefined();
        run.gold = 99;
        expect(buyOffer(run, copy!.wi, copy!.oi).ok).toBe(true);
        expect(mergePreview(run, rig.def), `${hero} ${seed}`).toBeNull();
        for (let k = 1; k <= 3; k++) {
          const ref = noFirst(run);
          expect(reroll(run)).toBe(true);
          expect(reroll(ref)).toBe(true);
          expect(offers(run), `${hero} ${seed} reroll ${k}`).toEqual(offers(ref));
        }
        n++;
      }
    }
    expect(n).toBe(80);
  }), 120_000);
});

describe("F3: day 3 on, the offers of a normal run with the same seed and the same buys", () => {
  it("the caravan (and its rerolls) and the rune offers from day 3 equal a normal run's", () => both(() => {
    for (const hero of HEROES) {
      for (let seed = 1; seed <= 30; seed++) {
        const a = newRun(hero, seed, "r", true), b = newRun(hero, seed, "r");
        expect(a.firstRun).toBe(true);
        expect(b.firstRun).toBeUndefined();
        // the same buys and picks in both runs (set as state: a normal run's dawn may not offer the first run's cards)
        for (const r of [a, b]) {
          r.build.runes = [{ id: "iron_skin" }];
          r.build.hullBonus += 150;
          delete r.runeDay;
          r.inventory.push({ uid: r.nextUid++, def: seed % 2 ? "rasp" : "whetstone" });
          dusk(r);
          r.build.runes = [...r.build.runes!, { id: "tar_barrel" }];
          r.build.beltCap += 8;
          delete r.runeDay;
          dusk(r);
        }
        expect(a.day).toBe(3);
        expect(firstRunGated(a)).toBe(false);
        expect(a.lastMerchants).toEqual(b.lastMerchants);
        expect(a.shop).toEqual(b.shop);
        expect(pendingRune(a)).toEqual(pendingRune(b));
        a.gold = b.gold = 50;
        for (let k = 0; k < 2; k++) {
          reroll(a);
          reroll(b);
          expect(a.shop).toEqual(b.shop);
        }
        for (const r of [a, b]) {
          expect(takeRune(r, pendingRune(r)!.ids[0]).ok).toBe(true);
          dusk(r);
        }
        expect(a.shop).toEqual(b.shop);
        expect(pendingRune(a)).toEqual(pendingRune(b));
      }
    }
  }), 180_000);
});
