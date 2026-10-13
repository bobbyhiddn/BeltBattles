// OPEN-1 (REQ-BFG-109; BRIEF-OPEN1 sections 3 and 6.1): the open rune pool behind OPEN_RUNES (src/sim/openRunes.ts).
// The switch and its rules row; the dawn offer and LAST CHANCE's rune card on and off on fixed seeds (open: hero-blind, no
// style weight, no fit filter, no FIX-10 redraw); the game and the bots follow the switch; the server's checks follow the
// record's own rules (an old-rules record holding a rune today's rule never offered is refused, an open-rules record
// holding it is accepted), LAST CHANCE's card both ways; the captains keep today's weighted offer (genCaptainRunes's
// output and CAPTAIN_RUNES byte-identical with the switch on and off).
import { describe, expect, it } from "vitest";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { OPEN_RUNES, openRunesRules, withOpenRunes } from "../src/sim/openRunes";
import { OPEN_RUNES_RULES, openRunesFor } from "../src/net/rulesGate";
import { GENERIC_THEMES, HERO_STYLE, RUNES, botRuneList, botTakeRune, runeFits, runeOffer, runeProblem, runeWeight } from "../src/sim/runes";
import { lastChanceOffer } from "../src/sim/lastChance";
import { newRun, pendingLastChance, pendingRune } from "../src/game/run";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { lastChanceProblem, validateUpload } from "../src/net/validate";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { CAPTAIN_RUNES } from "../src/sim/rivalBuilds";
import { RIVALS, RIVAL_IDS } from "../src/sim/rivals";
import { allCaptainRunes, captainRuneSeed, captainRunes, captainRunesText } from "../tools/genCaptainRunes";
import { PROBE_RULES, PROBE_SEED, probeRunes } from "../server/ghostProbe";

const HEROES4: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
/** A rules version before OPEN_RUNES_RULES (RULES_VERSION until BUMP-1D; it stays older after the bump). */
const OLD_RULES = "bb-0.9.3";
const SEEDS = Array.from({ length: 400 }, (_, i) => 1 + i * 7919);
const ids = (b: Build): string[] => (b.runes ?? []).map((q) => q.id);
/** Is rune `id` of another playable hero's style than `hero`'s? */
const otherStyle = (id: string, hero: HeroId): boolean => !GENERIC_THEMES.includes(RUNES[id].theme) && RUNES[id].theme !== HERO_STYLE[hero];

describe("OPEN-1: the switch and its rules row", () => {
  // HULL-ON (the flip, OPEN_RUNES): the switch ships on (was off; the title was "OPEN_RUNES is off in this rules version;
  // ..."), so the default reads on and the put-back is read from on: off for one call, even on a throw
  it("OPEN_RUNES ships on (HULL-ON's flip, bb-0.10.0); withOpenRunes puts the switch back, even on a throw", () => {
    expect(OPEN_RUNES).toBe(true);
    expect(openRunesRules()).toBe(true);
    expect(withOpenRunes(() => openRunesRules())).toBe(true);
    expect(withOpenRunes(() => openRunesRules(), false)).toBe(false);
    expect(openRunesRules()).toBe(true);
    expect(() => withOpenRunes(() => { throw new Error("boom"); }, false)).toThrow("boom");
    expect(openRunesRules()).toBe(true);
  });

  it("openRunesFor(rules): the switch AND rules at or after OPEN_RUNES_RULES (RULES_VERSION until BUMP-1D writes it)", () => {
    expect(OPEN_RUNES_RULES).toBe(RULES_VERSION);
    // HULL-ON (the flip, OPEN_RUNES): "false whatever the rules" is the switch-off half, so it sets the switch off itself
    withOpenRunes(() => {
      for (const r of [RULES_VERSION, OLD_RULES, "bb-99.0.0", "nonsense", undefined]) expect(openRunesFor(r), String(r)).toBe(false);
    }, false);
    withOpenRunes(() => {
      expect(openRunesFor(RULES_VERSION)).toBe(true);
      expect(openRunesFor("bb-99.0.0")).toBe(true);
      expect(openRunesFor(OLD_RULES)).toBe(false);
      expect(openRunesFor("nonsense")).toBe(false);
      expect(openRunesFor(undefined)).toBe(false);
    });
  });
});

describe("OPEN-1: the dawn offer, on and off", () => {
  it("fixed seeds: closed (the default) is today's weighted offer; open is one offer for every hero", () => {
    // closed (the default argument): today's draws, hero by hero (the style weights and FIX-10)
    expect(HEROES4.map((h) => runeOffer(1, 5, h, []).ids)).toEqual([
      ["scrap_medic", "toll_road"], ["steady_iron", "iron_temper"], ["iron_hide", "hot_seam"], ["tick_guard", "ward_stone"],
    ]);
    expect(HEROES4.map((h) => runeOffer(20261011, 9, h, []).ids)).toEqual([
      ["fat_purse", "scrap_medic"], ["fat_purse", "iron_hide"], ["fat_purse", "iron_hide"], ["fat_purse", "tick_guard"],
    ]);
    // open: the same cards whatever the hero
    for (const h of HEROES4) {
      expect(runeOffer(1, 5, h, [], true).ids, h).toEqual(["iron_hide", "iron_temper"]);
      expect(runeOffer(20261011, 9, h, [], true).ids, h).toEqual(["war_edge", "iron_hide"]);
      expect(runeOffer(42, 1, h, [], true).ids, h).toEqual(["spoils_sack", "rivet_hoard", "oiled_cogs"]);
    }
  });

  it("runeWeight: closed own style x3, a generic theme x2, another hero's style x1; open every rune 1", () => {
    for (const h of HEROES4) for (const d of Object.values(RUNES)) {
      const want = GENERIC_THEMES.includes(d.theme) ? 2 : d.theme === HERO_STYLE[h] ? 3 : 1;
      expect(runeWeight(d, h), `${h} ${d.id}`).toBe(want);
      expect(runeWeight(d, h, false), `${h} ${d.id}`).toBe(want);
      expect(runeWeight(d, h, true), `${h} ${d.id}`).toBe(1);
    }
  });

  it("open is hero-blind on every seed, day and held list; it keeps the tiers, no repeats, no two cards of one theme, the held runes out", () => {
    for (const seed of SEEDS.slice(0, 150)) for (let day = 1; day <= 12; day++) {
      const held = runeOffer(seed + 1, 2, "weaver", [], true).ids.slice(0, Math.min(day - 1, 2));
      const offers = [...HEROES4, "metronome", "siphon"].map((h) => runeOffer(seed, day, h as HeroId, held, true));
      for (const o of offers) expect(o, `${seed} d${day}`).toEqual(offers[0]);
      const o = offers[0];
      expect(new Set(o.ids).size).toBe(o.ids.length);
      expect(new Set(o.ids.map((q) => RUNES[q].theme)).size).toBe(o.ids.length);
      for (const q of o.ids) {
        expect(held).not.toContain(q);
        expect(RUNES[q].tier).toBe(o.tier);
      }
      // the tier draw is the closed offer's (the same stream, the same first number)
      expect(o.drawn).toBe(runeOffer(seed, day, "foundry", held).drawn);
    }
  });

  it("open has no FIX-10 redraw: some open offers hold no card that fits the hero; every closed one holds one", () => {
    for (const h of HEROES4) {
      let unfit = 0;
      for (const seed of SEEDS) for (let day = 1; day <= 10; day++) {
        expect(runeOffer(seed, day, h, []).ids.some((q) => runeFits(RUNES[q], h)), `${h} ${seed} d${day}`).toBe(true);
        if (!runeOffer(seed, day, h, [], true).ids.some((q) => runeFits(RUNES[q], h))) unfit++;
      }
      expect(unfit, h).toBeGreaterThan(0);
    }
  });

  it("another hero's style shows more often open than closed (the operator's \"I never see ... on foundry\")", () => {
    for (const h of HEROES4) {
      let closed = 0, open = 0, cards = 0;
      for (const seed of SEEDS) for (let day = 1; day <= 10; day++) {
        const c = runeOffer(seed, day, h, []).ids, o = runeOffer(seed, day, h, [], true).ids;
        cards += c.length;
        closed += c.filter((q) => otherStyle(q, h)).length;
        open += o.filter((q) => otherStyle(q, h)).length;
      }
      // measured on seeds 1-2000: closed 18.5-19.7% of the cards, open 31.6-33.4%
      expect(closed / cards, h).toBeLessThan(0.25);
      expect(open / cards, h).toBeGreaterThan(0.27);
    }
  });

  it("the game follows the switch: pendingRune shows the open offer with OPEN_RUNES on, today's with it off", () => {
    for (const h of HEROES4) for (const seed of [1, 42, 20261011]) {
      const run = newRun(h, seed);
      // HULL-ON (the flip, OPEN_RUNES): today's offer is the switch-off half (it read the default, now on); the default is open
      expect(withOpenRunes(() => pendingRune(run)?.ids, false), `${h} ${seed}`).toEqual(runeOffer(seed, 1, h, []).ids);
      expect(withOpenRunes(() => pendingRune(run)?.ids), `${h} ${seed}`).toEqual(runeOffer(seed, 1, h, [], true).ids);
      expect(pendingRune(run)?.ids, `${h} ${seed}`).toEqual(runeOffer(seed, 1, h, [], true).ids);
    }
  });
});

describe("OPEN-1: LAST CHANCE's rune card, on and off", () => {
  it("fixed seeds: closed fits the hero and is weighted; open is one even draw for every hero; the part never moves", () => {
    expect(HEROES4.map((h) => lastChanceOffer(1, 8, h, []).rune?.id)).toEqual(["thread_storm", "widows_web", "scrap_saint", "scab_iron"]);
    for (const h of HEROES4) {
      // HULL-ON (HULL_SCALE, on since AZ-BUMP's flip def6e73): the PART card is ★2 (HULL-1d lastChancePartStars: partStars 2)
      expect(lastChanceOffer(1, 8, h, [], true), h).toEqual({ day: 8, rune: { id: "scrap_saint", tier: "epic" }, part: "chamber", partStars: 2, hull: 500 });
      expect(lastChanceOffer(1, 8, h, []).part, h).toBe("chamber");
      expect(lastChanceOffer(1, 5, h, [], true).rune?.id, h).toBe("thread_storm");
    }
  });

  it("closed: the card always fits the hero; open: hero-blind, the same part, and another hero's style about a quarter of the time", () => {
    for (const h of HEROES4) {
      let other = 0, n = 0;
      for (const seed of SEEDS) for (const day of [2, 5, 7, 9]) {
        const held = day > 2 ? runeOffer(seed, 1, "furnace", [], true).ids.slice(0, 1) : [];
        const c = lastChanceOffer(seed, day, h, held), o = lastChanceOffer(seed, day, h, held, true);
        expect(runeFits(RUNES[c.rune!.id], h), `${h} ${seed} d${day}`).toBe(true);
        expect(o, `${h} ${seed} d${day}`).toEqual(lastChanceOffer(seed, day, "weaver", held, true));
        expect(o.part).toBe(c.part);
        expect(held).not.toContain(o.rune!.id);
        n++;
        if (otherStyle(o.rune!.id, h)) other++;
      }
      // measured on seeds 1-2000: 27.3-27.6% open, 0% closed
      expect(other / n, h).toBeGreaterThan(0.2);
    }
  });

  it("the game follows the switch: pendingLastChance shows the open card with OPEN_RUNES on, today's with it off", () => {
    const run = { seed: 1, hero: "bastion" as HeroId, build: { runes: [] } as unknown as Build, lastChance: { day: 8 }, over: false };
    // HULL-ON (the flip, OPEN_RUNES): today's card is the switch-off half (it read the default, now on); the default is open
    expect(withOpenRunes(() => pendingLastChance(run)?.rune?.id, false)).toBe("scab_iron");
    expect(withOpenRunes(() => pendingLastChance(run)?.rune?.id)).toBe("scrap_saint");
    expect(pendingLastChance(run)?.rune?.id).toBe("scrap_saint");
  });
});

// ---------------------------------------------------------------- the server's checks, both ways

/** An honest upload at dusk D: the par player's day-D deck (one rune a dawn) and its run seed, under `open`. */
function parDeck(hero: HeroId, seed: number, D: number, open: boolean): GhostSnapshot {
  const build = withOpenRunes(() => playerRun(hero, D, seed)[D - 1].build, open);
  return {
    v: SNAPSHOT_V3, rules: RULES_VERSION, hero, day: D, wins: D - 1, lives: 5, build, runId: `open1-${hero}-${seed}`,
    playerId: "p-open1", createdAt: 1_790_000_000_000, seed: parRunSeed(hero, seed),
  };
}
const up = (s: GhostSnapshot, rules = s.rules) =>
  validateUpload(s.build, s.day, rules, { seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}) });

describe("OPEN-1: the server's checks read the record's own rules", () => {
  it("an open-rules record holding a rune today's rule never offered is accepted; under older rules, or with the switch off, refused", () => {
    // FOUNDRY, par seed 2, day 4: its open dawn 3 took TAR BARREL, which today's weighted offer didn't show at that dawn
    const s = parDeck("foundry", 2, 4, true);
    expect(ids(s.build)).toEqual(["final_nail", "gun_oil", "tar_barrel", "sharp_scrap"]);
    const refused = ["rune: runes[2]: TAR BARREL was not offered at the dawn of day 3"];
    withOpenRunes(() => {
      const v = up(s);
      expect(v.ok, v.errors.join("; ")).toBe(true);
      expect(isSnapshot(s)).toBe(true);
      expect(up(s, OLD_RULES).errors).toEqual(refused);
      expect(isSnapshot({ ...s, rules: OLD_RULES })).toBe(false);
    });
    // HULL-ON (the flip, OPEN_RUNES): "with the switch off, refused" sets the switch off itself (it read the default, now on)
    withOpenRunes(() => {
      expect(up(s).errors).toEqual(refused);
      expect(isSnapshot(s)).toBe(false);
    }, false);
    // BASTION, par seed 1, day 4: MANY HANDS at the first dawn
    const b = parDeck("bastion", 1, 4, true);
    withOpenRunes(() => expect(up(b).ok).toBe(true));
    withOpenRunes(() => expect(up(b).errors).toEqual(["rune: runes[0]: MANY HANDS was not offered at the dawn of day 1"]), false); // HULL-ON (OPEN_RUNES): off
  });

  it("a record of today's offers keeps passing under older rules with the switch on, and under every rules with it off", () => {
    const t = parDeck("foundry", 2, 4, false);
    expect(runeProblem(t.build.runes, 4, "foundry", t.seed, "exact")).toBeNull();
    // HULL-ON (the flip, OPEN_RUNES): "under every rules with it off" sets the switch off itself (it read the default, now on)
    withOpenRunes(() => {
      expect(up(t).ok).toBe(true);
      expect(up(t, OLD_RULES).ok).toBe(true);
    }, false);
    withOpenRunes(() => {
      expect(up(t, OLD_RULES).ok).toBe(true);
      expect(isSnapshot({ ...t, rules: OLD_RULES })).toBe(true);
    });
  });

  it("LAST CHANCE's rune card both ways: the open card is accepted under open rules and refused closed; today's card the other way round", () => {
    const D = 5;
    /** The par run that took LAST CHANCE's rune card at dusk D under `open` (lc1.server's honest("rune")). */
    const lcRun = (hero: HeroId, seed: number, open: boolean): GhostSnapshot => withOpenRunes(() => {
      const runSeed = parRunSeed(hero, seed);
      const before = playerRun(hero, D, seed)[D - 1].build;
      const offer = lastChanceOffer(runSeed, D, hero, ids(before), open);
      const build = playerRun(hero, D + 1, seed, { lastChance: { day: D, boon: "rune" } })[D].build;
      expect(ids(build)[D]).toBe(offer.rune!.id);
      return {
        v: SNAPSHOT_V3, rules: RULES_VERSION, hero, day: D + 1, wins: 0, lives: 2, build, runId: `open1-lc-${hero}-${seed}`,
        playerId: "p-open1", createdAt: 1_790_000_000_000, seed: runSeed, lastChance: { day: D, boon: "rune", id: offer.rune!.id },
      };
    }, open);
    let checked = 0;
    for (const hero of ["bastion", "furnace"] as HeroId[]) for (let seed = 1; seed <= 6 && checked < 2; seed++) {
      const o = lcRun(hero, seed, true);
      const held = ids(o.build).slice(0, D);
      const closedCard = lastChanceOffer(o.seed!, D, hero, held).rune!.id;
      if (closedCard === o.lastChance!.id) continue;
      checked++;
      withOpenRunes(() => {
        const v = up(o);
        expect(v.ok, v.errors.join("; ")).toBe(true);
      });
      // HULL-ON (the flip, OPEN_RUNES): "refused closed" and "accepted with the switch off" set the switch off themselves
      withOpenRunes(() => expect(up(o).errors[0]).toBe(`lastChance: rune ${o.lastChance!.id} was not in the LAST CHANCE offer of day ${D} (it offered ${closedCard})`), false);
      // the check itself, both ways (validate.ts lastChanceProblem's `open`)
      expect(lastChanceProblem(o.lastChance as { day: number; boon: "rune"; id: string }, o.build, o.day, o.seed, true)).toBeNull();
      expect(lastChanceProblem(o.lastChance as { day: number; boon: "rune"; id: string }, o.build, o.day, o.seed, false)).not.toBeNull();
      // today's card for the same hero and seed: accepted with the switch off
      const c = lcRun(hero, seed, false);
      withOpenRunes(() => expect(up(c).ok).toBe(true), false);
      const openCard = lastChanceOffer(c.seed!, D, hero, ids(c.build).slice(0, D), true).rune!.id;
      if (openCard !== c.lastChance!.id) withOpenRunes(() => expect(up(c).ok).toBe(false));
    }
    expect(checked).toBe(2);
  }, 120_000);
});

describe("OPEN-1: the bots follow the switch", () => {
  it("the par player's dawn runes come from the open offers with OPEN_RUNES on (its cache keeps the two apart), today's with it off", () => {
    const seed = parRunSeed("foundry", 2);
    const on = withOpenRunes(() => playerRun("foundry", 4, 2)[3].build.runes);
    const off = withOpenRunes(() => playerRun("foundry", 4, 2)[3].build.runes, false); // HULL-ON (the flip, OPEN_RUNES): off itself (was the default)
    expect(playerRun("foundry", 4, 2)[3].build.runes).toEqual(on); // HULL-ON (the flip, OPEN_RUNES): the default follows the switch, on
    expect(on).not.toEqual(off);
    expect(runeProblem(on, 4, "foundry", seed, "exact", false, -1, true)).toBeNull();
    expect(runeProblem(on, 4, "foundry", seed, "exact")).not.toBeNull();
    expect(runeProblem(off, 4, "foundry", seed, "exact")).toBeNull();
    expect(withOpenRunes(() => playerRun("foundry", 4, 2)[3].build.runes)).toEqual(on);
  });

  it("botTakeRune and botRuneList take `open`; the ghost probe's honest decks take the offers of PROBE_RULES", () => {
    for (const h of HEROES4) {
      const b = heroStartBuild(h);
      const got = botTakeRune(b, 77, 1, h, true, false, 0, true);
      expect(runeOffer(77, 1, h, [], true).ids).toContain(got!.id);
      const list = botRuneList(77, h, () => heroStartBuild(h), 6, true);
      expect(runeProblem(list.map((id) => ({ id })), 6, h, 77, "exact", false, -1, true)).toBeNull();
      expect(botRuneList(77, h, () => heroStartBuild(h), 6)).toEqual(botRuneList(77, h, () => heroStartBuild(h), 6, false));
      const probe = withOpenRunes(() => probeRunes(heroStartBuild(h), 4));
      withOpenRunes(() => expect(runeProblem(probe.runes, 4, h, PROBE_SEED, "exact", false, -1, openRunesFor(PROBE_RULES))).toBeNull());
    }
  });
});

describe("OPEN-1: the captains keep today's weighted offer", () => {
  it("tools/genCaptainRunes.ts's output and the CAPTAIN_RUNES table are byte-identical with OPEN_RUNES on and off", () => {
    const table = JSON.stringify(CAPTAIN_RUNES);
    const off = captainRunesText();
    const on = withOpenRunes(() => captainRunesText());
    expect(on).toBe(off);
    expect(withOpenRunes(() => JSON.stringify(CAPTAIN_RUNES))).toBe(table);
    const lists = withOpenRunes(() => allCaptainRunes());
    for (const id of RIVAL_IDS) {
      expect(lists[id], id).toEqual(CAPTAIN_RUNES[id]);
      expect(withOpenRunes(() => captainRunes(id)), id).toEqual(CAPTAIN_RUNES[id]);
      // the whole list passes the closed check on the captain's seed, with the switch on and off (every prefix: the
      // generator's own check)
      const runes = CAPTAIN_RUNES[id]!.map((q) => ({ id: q })), hero = RIVALS[id].hero;
      expect(runeProblem(runes, 10, hero, captainRuneSeed(id), "exact"), id).toBeNull();
      expect(withOpenRunes(() => runeProblem(runes, 10, hero, captainRuneSeed(id), "exact")), id).toBeNull();
    }
    expect(openRunesRules()).toBe(false);
  }, 120_000);
});
