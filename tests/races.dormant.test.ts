// Race heroes and their signature factories remain unplayable; the two timing mods from the
// race table are sold in the shared pool before Metronome becomes playable.
import { describe, expect, it } from "vitest";
import { chooseFoe, ghostOf } from "../src/game/day";
import { EVENT_IDS } from "../src/game/eventDefs";
import { choicesFor, makeEvent } from "../src/game/events";
import { standInFoe } from "../src/game/ghosts";
import { forkFor, hardParts, warlordDeck } from "../src/game/road";
import { newRun, reroll, rollShop } from "../src/game/run";
import { PORTRAIT_KEYS } from "../src/render/portraits";
import { AMMO, HEROES, ITEMS, MERCHANTS, OFFERS, RULES_VERSION, itemsSoldBy, type MerchantId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { RACE_AMMO, RACE_HEROES, RACE_ITEMS } from "../src/sim/races/data";
import { RIVALS, RIVAL_IDS, rivalBuild, rivalDays } from "../src/sim/rivals";
import { STAND_IN_POOL_HEROES } from "../src/sim/standInPool";

const RACE_ITEM = new Set(Object.keys(RACE_ITEMS).filter((id) => RACE_ITEMS[id].kind === "factory"));
const RACE_AMMO_KIND = new Set<string>(Object.keys(RACE_AMMO));
const PLAYABLE = new Set<string>(PLAYABLE_HEROES);
const raceParts = (b: Build): string[] => [...b.items, ...b.mods].map((p) => p.def).filter((d) => RACE_ITEM.has(d));
const DAYS = Array.from({ length: 10 }, (_, i) => i + 1);

describe("race heroes and signature factories remain dormant while timing gear is shared", () => {
  it("rules are 0.6.2's and the roster is still 0.6.0's, while the race entries do sit in HEROES, ITEMS and AMMO", () => {
    expect(RULES_VERSION).toBe("bb-0.6.2");
    expect(PLAYABLE_HEROES).toEqual(["furnace", "weaver"]);
    for (const h of Object.keys(RACE_HEROES)) expect(HEROES).toHaveProperty(h);
    for (const d of Object.keys(RACE_ITEMS)) expect(ITEMS).toHaveProperty(d);
    for (const a of RACE_AMMO_KIND) expect(AMMO).toHaveProperty(a);
    expect(STAND_IN_POOL_HEROES.every((h) => PLAYABLE.has(h))).toBe(true);
  });

  it("race signature factories remain unsold; the two timing mods are merchant stock", () => {
    for (const id of RACE_ITEM) expect(RACE_ITEMS[id].merchant, id).toBeUndefined();
    for (const id of ["escapement", "longcase"]) expect(RACE_ITEMS[id].merchant, id).toBe("gunsmith");
    for (const m of Object.keys(MERCHANTS) as MerchantId[]) {
      expect(itemsSoldBy(m).filter((d) => RACE_ITEM.has(d.id)), m).toEqual([]);
      for (const d of itemsSoldBy(m)) if (d.factory) expect(RACE_AMMO_KIND.has(d.factory.ammo), d.id).toBe(false);
    }
    for (const h of PLAYABLE_HEROES) {
      expect(RACE_AMMO_KIND.has(HEROES[h].ammo), h).toBe(false);
      expect(RACE_ITEM.has(HEROES[h].factory), h).toBe(false);
    }
  });

  it("the caravan shop never offers a race signature factory: 200 seeds x days 1-10", () => {
    for (const hero of PLAYABLE_HEROES) {
      for (let seed = 1; seed <= 200; seed++) {
        for (const day of DAYS) {
          const run = newRun(hero, seed);
          run.day = day;
          run.gold = 999;
          rollShop(run);
          for (let r = 0; r <= 2; r++) {
            if (r) expect(reroll(run)).toBe(true);
            const offers = run.shop.wagons.flatMap((w) => w.offers.map((o) => o.def));
            expect(offers).toHaveLength(OFFERS);
            expect(offers.filter((d) => RACE_ITEM.has(d)), `${hero} s${seed} d${day} r${r}`).toEqual([]);
          }
        }
      }
    }
  });

  it("the road fork captains play a playable hero without race signature factories", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const day of DAYS) {
        for (const beaten of day >= 9 ? [null, 8] : [null]) {
          const fork = forkFor({ seed, day, matriarchBeatenOn: beaten });
          for (const id of [fork.warlords.easy, fork.warlords.medium, fork.warlords.hard]) {
            const deck = warlordDeck(id, day);
            expect(PLAYABLE.has(RIVALS[id].hero) && PLAYABLE.has(deck.hero), `${id} d${day}`).toBe(true);
            expect(raceParts(deck), `${id} d${day}`).toEqual([]);
            expect(hardParts(id, deck, day).filter((d) => RACE_ITEM.has(d)), `${id} d${day}`).toEqual([]);
          }
        }
      }
    }
    for (const id of RIVAL_IDS) for (const day of rivalDays(id)) expect(raceParts(rivalBuild(id, day)), `${id} d${day}`).toEqual([]);
  });

  it("road events never give a race signature factory: every event x 100 seeds x days 1-10", () => {
    let given = 0;
    for (const id of EVENT_IDS) {
      for (let seed = 1; seed <= 100; seed++) {
        for (const day of DAYS) {
          const run = newRun(PLAYABLE_HEROES[seed % 2], seed);
          run.day = day;
          const gains = choicesFor(run, makeEvent(seed, day, id)).flatMap((c) => c.gain);
          const parts = gains.flatMap((g) => (g.k === "item" ? [g.def] : []));
          given += parts.length;
          expect(parts.filter((d) => RACE_ITEM.has(d)), `${id} s${seed} d${day}`).toEqual([]);
        }
      }
    }
    expect(given).toBeGreaterThan(0); // salvage, swap and smuggler parts were drawn
  });

  it("the dusk foe (seeded draw): stand-ins and pool ghosts are playable heroes with no race part", () => {
    for (let seed = 1; seed <= 500; seed++) {
      for (const day of DAYS) {
        const f = standInFoe(seed, day);
        expect(PLAYABLE.has(f.hero) && f.build.hero === f.hero, `s${seed} d${day}`).toBe(true);
        expect(raceParts(f.build), `s${seed} d${day}`).toEqual([]);
      }
    }
    // A pool of the game's own dusk snapshots (ghostOf), one earlier run per playable hero and day.
    const pool = PLAYABLE_HEROES.flatMap((h, i) => DAYS.map((day) => ({ ...newRun(h, 900 + i), day })).map((r) => ghostOf(r, 0, "p1")));
    for (let seed = 1; seed <= 200; seed++) {
      for (const day of DAYS) {
        const run = { ...newRun(PLAYABLE_HEROES[seed % 2], seed), day };
        const foe = chooseFoe(run, pool);
        expect(foe.kind, `s${seed} d${day}`).toBe("ghost");
        expect(PLAYABLE.has(foe.hero) && raceParts(foe.build).length === 0, `s${seed} d${day}`).toBe(true);
      }
    }
  });

  it("portraits cover the rivals and the heroes with art: 0.8.0 H1 adds FOUNDRY and BASTION, never METRONOME or SIPHON yet", () => {
    expect(PORTRAIT_KEYS.filter((k) => k in RACE_HEROES)).toEqual(["foundry", "bastion"]);
    expect(PORTRAIT_KEYS.filter((k) => !(k in RIVALS))).toEqual(["furnace", "weaver", "foundry", "bastion"]);
    for (const h of PLAYABLE_HEROES) expect(PORTRAIT_KEYS).toContain(h);
  });
});
