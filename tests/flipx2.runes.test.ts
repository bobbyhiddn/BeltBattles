// FLIP-X2 (REQ-BFG-058, REQ-BFG-069): release X's flips and run rules (step 2), and cap's ruling 5d6d83ef57d1494c on the
// rune count:
// - both switches on together (content.ts SUSTAIN_LIVE, runes.ts BOT_RUNES); bb-0.8.7's carried pool rules are gone;
// - EXACT for uploads: validateUpload (the player mode; the server's POST /v1/ghosts, seed.ts, ghostAdmin, the client's
//   online.ts pre-upload check and ghostClient's served ghosts) takes one rune a dawn, `runes.length === day`, an absent
//   field counting as 0, so a client can't skip a pick by leaving the field out (RUNES087F section 7.3);
// - AT MOST `day` for the strict content checks (validateBuild's default mode: stand-ins, pools, captains, generators,
//   hand-built decks) and for the device's local ghost pool (ghostSnapshot.ts isSnapshot -> ghosts.ts loadPool), where an
//   exact rule would delete every pre-rune ghost at the first dusk after the update (battle.ts saveGhost writes back).
import { describe, expect, it } from "vitest";
import {
  POOL_RULES, POOL_RULES_CARRIED, RULES_VERSION, SUSTAIN_LIVE, sustainLive, type HeroId,
} from "../src/sim/content";
import {
  BOT_RUNES, DORMANT_RUNES, RUNES, RUNE_LIST, SUSTAIN_RUNE_LIST, botTakeRune, isRune, runeList, runeOffer, runeProblem,
} from "../src/sim/runes";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { validateBuild, validateUpload } from "../src/net/validate";
import type { Build } from "../src/sim/deck";
import { GHOST_KEY, loadPool, saveGhost, type GhostSnapshot } from "../src/game/ghosts";

const HEROES4: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const SEED = 4242;

/** `b` with the bots' picks at the dawns of days 1..day on run seed SEED (botTakeRune: the grants on the build). */
function withPicks(b: Build, day: number): Build {
  const out: Build = JSON.parse(JSON.stringify(b));
  for (let d = 1; d <= day; d++) expect(botTakeRune(out, SEED, d, out.hero, true), `${out.hero} dawn ${d}`).not.toBeNull();
  return out;
}

class MemStore {
  data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
}

describe("FLIP-X2 step 3b: TUNE-X's rune lines and the dormant runes (REVIEW-TUNEX)", () => {
  it("the six data lines: LEECH VOW rare 15, TWIN NAILS 10, LOOSE THREAD 2, GRAVE PLATES armor 240, MOLTEN BOND 20, TANGLE WIRE 5", () => {
    const at = (id: string) => [RUNES[id].tier, RUNES[id].theme, RUNES[id].amount.n];
    expect(at("leech_vow")).toEqual(["rare", "turrets", 15]); // was epic, 20
    expect(at("twin_nails")).toEqual(["common", "foundry", 10]); // was 20
    expect(at("loose_thread")).toEqual(["common", "weaver", 2]); // was 3
    expect(at("grave_plates")).toEqual(["rare", "armor", 240]); // was bastion, 120
    expect(at("molten_bond")).toEqual(["rare", "foundry", 20]); // was 40
    expect(at("tangle_wire")).toEqual(["rare", "weaver", 5]); // was 6
  });

  it("SEARING, SHATTER SHOT, COAL CHUTE and HEAT SINK are dormant: never offered, not listed, refused at a dawn; their defs stay", () => {
    expect([...DORMANT_RUNES].sort()).toEqual(["coal_chute", "heat_sink", "searing", "shatter_shot"]);
    for (const id of DORMANT_RUNES) expect(isRune(id), id).toBe(true); // an old snapshot decodes
    expect(runeList().some((d) => DORMANT_RUNES.has(d.id))).toBe(false);
    expect(runeList().length).toBe(RUNE_LIST.length + SUSTAIN_RUNE_LIST.length - 4); // 57 + 8 - 4 = 61
    const offered = new Set<string>();
    for (const hero of HEROES4) for (let seed = 1; seed <= 150; seed++) {
      const held: string[] = [];
      for (let day = 1; day <= 10; day++) {
        const o = runeOffer(seed, day, hero, held);
        o.ids.forEach((id) => offered.add(id));
        if (o.ids.length) held.push(o.ids[0]);
      }
    }
    expect([...offered].filter((id) => DORMANT_RUNES.has(id))).toEqual([]);
    for (const id of DORMANT_RUNES) {
      const list = [{ id: "iron_skin" }, { id: "tar_barrel" }, { id }]; // taken at the dawn of day 3 (a sustain rune's first)
      expect(runeProblem(list, 3, "furnace"), id).toBe(`runes[2]: ${RUNES[id].name} is dormant: no dawn offers it`);
      expect(runeProblem(list, 3, "furnace", undefined, "exact"), id).toBe(`runes[2]: ${RUNES[id].name} is dormant: no dawn offers it`);
      expect(runeProblem(list, 3, "furnace", undefined, "atMost", true), `${id}: the local pool keeps it`).toBeNull();
    }
  });
});

describe("FLIP-X2 step 2: the switches", () => {
  it("SUSTAIN_LIVE and BOT_RUNES are on together, and no rules version carries an older pool forward", () => {
    expect([SUSTAIN_LIVE, sustainLive(), BOT_RUNES]).toEqual([true, true, true]);
    expect(POOL_RULES_CARRIED).toEqual({});
    expect(POOL_RULES).toBe(RULES_VERSION);
  });
});

describe("FLIP-X2 step 2: the rune count (cap's ruling 5d6d83ef57d1494c)", () => {
  it("an upload holds exactly `day` runes: a missing runes field at day >= 1 and a skipped pick (day - 1 runes) are refused", () => {
    for (const hero of HEROES4) {
      const d1 = withPicks(heroStartBuild(hero), 1);
      expect(validateUpload(d1, 1, RULES_VERSION, { seed: SEED }).errors, `${hero} d1`).toEqual([]);
      const { runes: _drop, ...bare } = d1;
      // (a) a missing field counts as 0 (the hull and belt the rune gave are left, so only the count can refuse it)
      expect(validateUpload(bare as Build, 1, RULES_VERSION, { seed: SEED }).errors, `${hero} d1, no field`).toEqual(["rune: runes: 0 held on day 1, one a dawn (1)"]);
      const d3 = withPicks(heroRefBuild(hero, 3), 3);
      expect(validateUpload(d3, 3, RULES_VERSION, { seed: SEED }).errors, `${hero} d3`).toEqual([]);
      // (b) a skipped pick: day - 1 runes
      expect(validateUpload({ ...d3, runes: d3.runes!.slice(0, 2) }, 3, RULES_VERSION, { seed: SEED }).errors, `${hero} d3, 2 runes`).toEqual(["rune: runes: 2 held on day 3, one a dawn (3)"]);
      // more than one a dawn is refused in either mode, as before
      expect(runeProblem([...d3.runes!, { id: "iron_skin" }], 3, hero)).toBe("runes: 4 held on day 3, at most one a dawn");
    }
  });

  it("a strict content check takes at most `day` runes, an absent field allowed (stand-ins, pools, captains, hand-built decks)", () => {
    for (const hero of HEROES4) {
      const ref = heroRefBuild(hero, 3);
      expect(validateBuild(ref, 3).errors, `${hero} rune-less`).toEqual([]);
      const two = withPicks(ref, 2);
      expect(validateBuild(two, 3, "strict", { seed: SEED }).errors, `${hero} 2 runes on day 3`).toEqual([]);
      expect(runeProblem(undefined, 3, hero)).toBeNull();
      expect(runeProblem(undefined, 3, hero, undefined, "exact")).toBe("runes: 0 held on day 3, one a dawn (3)");
    }
  });

  it("the local pool keeps an entry with fewer runes than its day and one with no runes field, through loadPool and saveGhost", () => {
    const st = new MemStore();
    const base = { rules: RULES_VERSION, hero: "weaver", day: 3, wins: 1, lives: 4, runId: "other", playerId: "p-test" } as const;
    const short = { ...base, v: 3, build: withPicks(heroStartBuild("weaver"), 1), createdAt: 1 } as GhostSnapshot;
    const none = { ...base, v: 2, build: heroStartBuild("weaver"), createdAt: 2 } as GhostSnapshot;
    expect([short.build.runes?.length, "runes" in none.build]).toEqual([1, false]);
    st.setItem(GHOST_KEY, JSON.stringify([short, none]));
    expect(loadPool(st).map((g) => g.createdAt)).toEqual([1, 2]);
    saveGhost({ ...none, createdAt: 3 }, st); // a dusk writes the whole pool back
    const pool = loadPool(st);
    expect(pool.map((g) => g.createdAt)).toEqual([1, 2, 3]);
    expect([pool[0].build.runes, pool[1].build.runes]).toEqual([short.build.runes, undefined]);
    // the same decks are refused as uploads (validateUpload's exact count)
    expect(validateUpload(short.build, 3).errors).toEqual(["rune: runes: 1 held on day 3, one a dawn (3)"]);
    expect(validateUpload(none.build, 3).errors).toEqual(["rune: runes: 0 held on day 3, one a dawn (3)"]);
  });
});
