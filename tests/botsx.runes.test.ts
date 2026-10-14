// BOTS-X step 4 (REQ-BFG-058, REQ-BFG-069; RUNES-2a 3 steps 2 and 5's code): the bots' rune code, with the switches off
// (BOT_RUNES and SUSTAIN_LIVE false). The stand-in codecs' runes word (src/sim/standInPool.ts, src/sim/harness/
// standinCode.ts), the caravan candidate's bought cost (src/sim/harness/standins.ts caravanCand), CAPTAIN_RUNES and
// rivalBuild (src/sim/rivalBuilds.ts, src/sim/rivals.ts), botRunePick on runeList() (src/sim/runes.ts) and the captains'
// generator's count (tools/genCaptainRunes.ts). The pools, stand-ins, captains and bot picks themselves are held by their
// own tests (runes.bots, standInPool.*, harness.standinCode, standin.*, captains.*, rivals.*): with the switches off they
// pass unchanged.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import { ITEMS, withSustain, type HeroId } from "../src/sim/content";
import { cloneBuild, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import * as loader from "../src/sim/standInPool";
import * as harness from "../src/sim/harness/standinCode";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { STAND_IN_DATA as V11 } from "./fixtures/standInPoolData.v1.1";
import { caravanCandidate } from "../src/sim/harness/caravan";
import { STANDIN_MAX_STARS, boughtCost, caravanCand } from "../src/sim/harness/standins";
import { buildCost, validateBuild } from "../src/net/validate";
import { CAPTAIN_RUNES, captainRunesOn } from "../src/sim/rivalBuilds";
import { withNpcDay } from "../src/sim/npcDay"; // AZ-BUMP (the flip): the switch-off world of the caravanCand test
import { RIVALS, RIVAL_IDS, rivalBuild, rivalLoadout, type RivalId } from "../src/sim/rivals";
import {
  HERO_STYLE, RUNES, RUNE_HEROES, RUNE_LIST, SUSTAIN_RUNE_LIST, boardThemeCount, botRuneList, botRunePick, runeGrants, runeList,
  runeOffer, runeProblem, type RuneOffer,
} from "../src/sim/runes";
import { DORMANT_RUNES, type RuneDef } from "../src/sim/runes"; // FLIP-X2: the dormant runes (REVIEW-TUNEX)
import { captainRunesText } from "../tools/genCaptainRunes";

// ---------------------------------------------------------------- oracles pinned on bx e1e1004 (before this change)

/** sha256 of a value's JSON (key order included). */
const digest = (x: unknown): string => createHash("sha256").update(JSON.stringify(x)).digest("hex");

/**
 * digest(poolReads()) and digest(v11Reads()) as computed on bx e1e1004 with the codecs untouched (before BOTS-X step 4):
 * a first version of this file holding only poolReads, v11Reads and digest, run in the worktree NEW/wt-botsx-runes
 * (`nice -n 19 npx vitest run tests/botsx.runes.test.ts`) on 2026-10-05. They cover every stored stand-in's decode
 * (120 pool codes through four readers, the loader's standInPool / standInPar / standInPick, and the 120 v1.1 fixture
 * codes through five decoders), byte for byte, key order included. The rune-less codes below were written there too.
 */
// FLIP-X2 step 4.1: the stand-in pool is regenerated (94e0cbf; every deck holds its day's runes) and read as stored
// (BUNDLED_POOL_HULL_SCALE deleted, 9006765), so POOL_DIGEST is the regenerated pool's reads, taken on flipx2 4c50574 (was
// c51140d65a61f1ebfa7291edb54b95f6bad08a95f7a40a53a920db1fac06a92e on bx). V11_DIGEST (the v1.1 fixture) is unchanged.
// REDO-X step 2 (4.1): the stand-in pool regenerated once more on FIX-ABE's offers (09ce97c; the pools changed, the
// regeneration), so POOL_DIGEST is that pool's reads, taken on redox 9e62dd4 (was
// ef36014376cc240c66c424d5e1450efa94e3a830c77cdd0829f305a0c64128e6 on flipx2 4c50574)
// BAL-2 step 5 (4.1): the stand-in pool regenerated once on bb-0.9.1 (c5e4780; the pools changed, the regeneration), so
// POOL_DIGEST is that pool's reads, taken on bal2 dc73c60 (was
// ff8fb68494a75e02959db00fa37194612fa53f807946c7d232b38d17312c603a on redox 9e62dd4)
// Y7b2 step 5 (4.1): the stand-in pool regenerated once on bb-0.9.3, release Y's rules (4d772e4; the pools changed, the
// regeneration), so POOL_DIGEST is that pool's reads, taken on y7b2 4d772e4 (was
// c4dc69bfa66141ab71fce66a20bd762ec111db1cc0b5f720699f2a3dc3137578 on bal2 dc73c60)
// Z-BUMP (the pools): the stand-in pool regenerated once on bb-0.9.7, release Z's rules (2c4ba76, S6 lane 1; the pools
// changed, the regeneration), so POOL_DIGEST is that pool's reads, taken on zbump 2c4ba76 (was
// fbc8bdf3bbde0518069a21e68daa84a78a09c03e8a384b50043889b2b6093276 on y7b2 4d772e4)
// S8c (the pools: the stand-in pool regenerated ONCE under bb-0.10.0 with every switch on as shipped and the bots placing
// shapes, P1 83c039d; BRIEF-S8 S8c, RULING-S8-R5 section 3 item 2), so POOL_DIGEST is that pool's reads, taken on s8 (was
// 9728ce453a2ce0a0... on zbump 2c4ba76)
const POOL_DIGEST = "12ab3c0afe42a0354db940622a3f91716dfa23dc304ab496158e909cc0338f5d";
const V11_DIGEST = "89b371a4b0720d4686dc934273c9033448b239bc5dc8f99d68b1fddd3abe15a2";
/** Rune-less codes the encoders wrote on bx e1e1004 (see "a rune-less deck encodes byte for byte as on bx"). */
const RICH_CODE = "18 0 u23/kiln64 press66 slagpot88/1:544434241404 2:68584838281808 3:79695949>48//scrapcannon0! carronade1";
const START_FURNACE_V1 = "14 0/kiln64/1:544434241404/";
const START_WEAVER = "24 0/loom54/1:4434241404 1:5352514131211101 1:5657584838281808/";
const PAR_WEAVER_7 = "24 1500/loom54 dragchain22 plateroller43r1 hotswap15 sorting07r1*2 twingauge19r3 surge46r1 platebreaker27r1 sifter66/1:4434241404 1:5352514131211101 1:5657584838281808 2:12>11 4:17>18/";

/** Every stored stand-in as the decoders read it: per hero and day of the bundled pool, each stored code through the
 *  loader's decodeStarred and decodeStarredRaw and the harness's decodeStarred, then standInPool, standInPar and
 *  standInPick (seeds 1-3), the loader's own reads (x10 hull). */
function poolReads(): unknown[] {
  const out: unknown[] = [];
  for (const hero of loader.STAND_IN_POOL_HEROES) {
    for (let day = 1; day <= loader.STAND_IN_POOL_DAYS; day++) {
      const [par, entries] = STAND_IN_DATA.pools[hero]![day - 1];
      out.push([hero, day, par, entries.map((t) => [t[3], loader.decodeStarred(hero, t[3]), loader.decodeStarredRaw(hero, t[3]), harness.decodeStarred(hero, t[3])])]);
      out.push([loader.standInPool(hero, day), loader.standInPar(hero, day), [1, 2, 3].map((s) => loader.standInPick(hero, day, s))]);
    }
  }
  return out;
}

/** The v1.1 fixture's codes (v1 codes, gates on belt tiles) through the v1 decoders and both star-aware ones. */
function v11Reads(): unknown[] {
  const out: unknown[] = [];
  for (const [hero, days] of Object.entries(V11.pools) as [HeroId, NonNullable<(typeof V11.pools)[HeroId]>][]) {
    for (const d of days) for (const t of d[1]) {
      out.push([hero, t[3], loader.decodeStandIn(hero, t[3]), loader.decodeStandInRaw(hero, t[3]), loader.decodeStarred(hero, t[3]), loader.decodeStarredRaw(hero, t[3]), harness.decodeStarred(hero, t[3])]);
    }
  }
  return out;
}

/** Every stored code of the bundled pool, with its hero and day. */
const storedCodes = (): { hero: HeroId; day: number; code: string }[] =>
  loader.STAND_IN_POOL_HEROES.flatMap((hero) => STAND_IN_DATA.pools[hero]!.flatMap((d, i) => d[1].map((t) => ({ hero, day: i + 1, code: t[3] }))));

/** botRunePick exactly as it was on bx e1e1004 (the cards are RUNE_LIST's), frozen: the switch-off oracle. */
function bxPick(offer: RuneOffer | readonly string[], hero: HeroId, board: Build): string | null {
  const ids: readonly string[] = "ids" in offer ? offer.ids : offer;
  const cards = RUNE_LIST.filter((d) => ids.includes(d.id));
  if (!cards.length) return null;
  const own = HERO_STYLE[hero];
  const mine = cards.find((d) => d.theme === own);
  if (mine) return mine.id;
  let best = cards[0], most = boardThemeCount(best.theme, board);
  for (const d of cards.slice(1)) {
    const n = boardThemeCount(d.theme, board);
    if (n > most) {
      best = d;
      most = n;
    }
  }
  return best.id;
}

const HEROES4: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const rq = (...ids: string[]) => ids.map((id) => ({ id }));
const lastKey = (b: object): string => { const k = Object.keys(b); return k[k.length - 1]; };
/** The code with `word` added to its head (the runes word is the head's last). */
const withWord = (code: string, word: string): string => { const [head, ...rest] = code.split("/"); return [`${head} ${word}`, ...rest].join("/"); };
const thrown = (f: () => unknown): string => { try { f(); } catch (e) { return (e as Error).message; } return "no error"; };

// ---------------------------------------------------------------- 1. the codecs' runes word

describe("BOTS-X the stand-in codecs carry Build.runes (RUNES-2a 3 step 2)", () => {
  it("every stored stand-in decodes exactly as pinned (digests over the whole regenerated pool and the v1.1 fixture), holding its day's runes as the last key (the v1.1 fixture none), and re-encodes byte for byte", () => {
    const pool = poolReads(), v11 = v11Reads();
    expect(digest(pool)).toBe(POOL_DIGEST);
    expect(digest(v11)).toBe(V11_DIGEST);
    // FLIP-X2: the regenerated pool's decks hold their runes (was: no "runes" key anywhere, the bx pool was rune-less)
    expect(JSON.stringify(pool)).toContain('"runes"');
    expect(JSON.stringify(v11)).not.toContain('"runes"');
    const codes = storedCodes();
    expect(codes).toHaveLength(120);
    for (const { hero, day, code } of codes) {
      const raw = loader.decodeStarredRaw(hero, code), h = harness.decodeStarred(hero, code);
      // FLIP-X2: each stored deck holds exactly its day's runes, as the last key, in both codecs (was: no runes key)
      expect([raw.runes?.length, h.runes?.length, lastKey(raw), lastKey(h)], `${hero} d${day}`).toEqual([day, day, "runes", "runes"]);
      expect(loader.encodeStarred(raw), `${hero} d${day}`).toBe(code);
      expect(harness.encodeStarred(h), `${hero} d${day}`).toBe(code);
    }
  });

  it("a rune-less deck encodes byte for byte as on bx (pinned codes); an empty runes list writes no word and decodes to no key", () => {
    const rich: Build = { ...loader.decodeStarredRaw("furnace", "18 0/kiln64 press66 slagpot88/1:544434241404 2:68584838281808 3:79695949>48//scrapcannon0! carronade1"), upgrades: { turret: 2, factory: 3 } };
    expect([loader.encodeStarred(rich), harness.encodeStarred(rich)]).toEqual([RICH_CODE, RICH_CODE]);
    expect([loader.encodeStarred({ ...rich, runes: [] }), harness.encodeStarred({ ...rich, runes: [] })]).toEqual([RICH_CODE, RICH_CODE]);
    expect("runes" in loader.decodeStarredRaw("furnace", RICH_CODE)).toBe(false);
    expect("runes" in harness.decodeStarred("furnace", RICH_CODE)).toBe(false);
    expect(loader.encodeStandIn(heroStartBuild("furnace", 1))).toBe(START_FURNACE_V1);
    expect(loader.encodeStandIn({ ...heroStartBuild("furnace", 1), runes: [] })).toBe(START_FURNACE_V1);
    expect("runes" in loader.decodeStandIn("furnace", START_FURNACE_V1)).toBe(false);
    expect(loader.encodeStarred(heroStartBuild("weaver", 3))).toBe(START_WEAVER);
    expect(harness.encodeStarred(heroStartBuild("weaver", 3))).toBe(START_WEAVER);
    // FLIP-X2: bx's par deck (weaver day 7) is no longer in the regenerated pool, so its pinned code is decoded and
    // re-encoded by both codecs (was loader.encodeStarred(loader.standInPar("weaver", 7)))
    expect([loader.encodeStarred(loader.decodeStarredRaw("weaver", PAR_WEAVER_7)), harness.encodeStarred(harness.decodeStarred("weaver", PAR_WEAVER_7))]).toEqual([PAR_WEAVER_7, PAR_WEAVER_7]);
    expect("runes" in loader.decodeStarredRaw("weaver", PAR_WEAVER_7)).toBe(false);
  });

  it("a deck with runes round-trips through both codecs (turrets, a join, stars and levels too) and the v1 codec: same runes in pick order, the last key, everything else the same", () => {
    const runes = rq("iron_hide", "coin_purse");
    for (const { id } of runes) expect(RUNE_LIST.some((d) => d.id === id)).toBe(true);
    // the richest deck the code writes: turrets (a free starred copy and a bought one), a join, gear stars and both levels
    const base = loader.decodeStarredRaw("furnace", "18 0 u23/kiln64 press66 slagpot88/1:544434241404 2:68584838281808 3:79695949>48/calibrate0*2/scrapcannon0*2! carronade1");
    expect(base.turrets).toHaveLength(2);
    expect(base.routes.some((r) => r.join !== undefined)).toBe(true);
    const deck: Build = { ...base, runes };
    const code = loader.encodeStarred(deck);
    expect(code).toBe("18 0 u23 r:iron_hide,coin_purse/kiln64 press66 slagpot88/1:544434241404 2:68584838281808 3:79695949>48/calibrate0*2/scrapcannon0*2! carronade1");
    expect(harness.encodeStarred(deck)).toBe(code);
    const raw = loader.decodeStarredRaw("furnace", code), load = loader.decodeStarred("furnace", code), h = harness.decodeStarred("furnace", code);
    expect(raw).toEqual(deck);
    expect(JSON.stringify(load)).toBe(JSON.stringify(raw));
    expect(JSON.stringify(h)).toBe(JSON.stringify(raw));
    expect(raw.runes).toEqual(runes);
    expect(lastKey(raw)).toBe("runes");
    expect([loader.encodeStarred(raw), harness.encodeStarred(h)]).toEqual([code, code]);
    // every stored deck of the pool with three runes (a HULL rune among them; HULL stays in hullBonus as written)
    const three = rq("iron_skin", "war_edge", "tar_barrel");
    let n = 0;
    for (const { hero, day, code: held } of storedCodes()) {
      // FLIP-X2: the stored deck without its own runes word (the regenerated pool's decks hold their runes), so the word
      // added is the only one (was the stored code itself)
      const { runes: _own, ...bare } = loader.decodeStarredRaw(hero, held);
      const stored = loader.encodeStarred(bare as Build);
      const b: Build = { ...loader.decodeStarredRaw(hero, stored), runes: three };
      const c = loader.encodeStarred(b);
      expect(c, `${hero} d${day}`).toBe(withWord(stored, "r:iron_skin,war_edge,tar_barrel"));
      expect(harness.encodeStarred(b), `${hero} d${day}`).toBe(c);
      const back = loader.decodeStarredRaw(hero, c), hb = harness.decodeStarred(hero, c);
      expect(back, `${hero} d${day}`).toEqual(b);
      expect(JSON.stringify(hb), `${hero} d${day}`).toBe(JSON.stringify(back));
      expect(JSON.stringify(loader.decodeStarred(hero, c)), `${hero} d${day}`).toBe(JSON.stringify(loader.decodeStarred(hero, stored)).replace(/}$/, `,"runes":${JSON.stringify(three)}}`));
      n++;
    }
    expect(n).toBe(120);
    // the v1 codec: the same word (it writes no levels, as before)
    const v1 = loader.encodeStandIn({ ...heroStartBuild("furnace", 1), runes });
    expect(v1).toBe(withWord(START_FURNACE_V1, "r:iron_hide,coin_purse"));
    expect(loader.decodeStandIn("furnace", v1).runes).toEqual(runes);
    expect(loader.decodeStandInRaw("furnace", v1)).toEqual({ ...loader.decodeStandInRaw("furnace", START_FURNACE_V1), runes });
    expect(loader.decodeStarred("furnace", v1)).toEqual(loader.decodeStandIn("furnace", v1)); // a v1 code is a star-aware code
    for (const [hero, days] of Object.entries(V11.pools) as [HeroId, NonNullable<(typeof V11.pools)[HeroId]>][]) {
      for (const d of days) for (const t of d[1]) {
        const b: Build = { ...loader.decodeStandInRaw(hero, t[3]), runes: rq("loose_thread") };
        expect(loader.decodeStandInRaw(hero, loader.encodeStandIn(b))).toEqual(b);
      }
    }
  });

  it("malformed rune words and entries are refused by every decoder and encoder (nothing is dropped silently)", () => {
    const at = (head: string) => `${head}/kiln64/1:544434241404/`;
    for (const w of ["r:", "r:,", "r:iron_hide,", "r:,iron_hide", "r:Iron_hide", "r:iron-hide", "r:iron_hide;coin_purse", "u12 r:iron_hide,,coin_purse"]) {
      const word = w.split(" ").pop()!;
      for (const decode of [loader.decodeStarredRaw, harness.decodeStarred, loader.decodeStandInRaw, loader.decodeStandIn, loader.decodeStarred]) {
        expect(thrown(() => decode("furnace", at(`14 0 ${w}`))), w).toBe(`stand-in code: bad rune word "${word}"`);
      }
    }
    // the runes word is the head's last: after the levels' word, never before it (the star-aware decoders read the levels)
    for (const decode of [loader.decodeStarredRaw, harness.decodeStarred]) {
      expect(thrown(() => decode("furnace", at("14 0 r:iron_hide u12")))).toBe('stand-in code: bad upgrade word "r:iron_hide"');
      expect(thrown(() => decode("furnace", at("14 0 r:iron_hide coin_purse")))).toBe('stand-in code: bad upgrade word "r:iron_hide"');
      const b = decode("furnace", at("14 0 u12 r:iron_hide"));
      expect([b.upgrades, b.runes, lastKey(b)]).toEqual([{ factory: 2 }, rq("iron_hide"), "runes"]);
    }
    // the encoders refuse an entry the word can't carry: an id of the wrong shape, or a key besides id (GROW-1's counter)
    const start = heroStartBuild("furnace", 1);
    for (const bad of [[{ id: "Iron Hide" }], [{ id: "" }], [{ id: "iron_hide", n: 2 }]] as unknown as { id: string }[][]) {
      for (const encode of [loader.encodeStarred, harness.encodeStarred, loader.encodeStandIn]) {
        expect(thrown(() => encode({ ...start, runes: bad })), JSON.stringify(bad)).toMatch(/^stand-in code: rune .* is not \{ id \} with a snapshot id$/);
      }
    }
  });
});

// ---------------------------------------------------------------- 2. caravanCand's cost

describe("BOTS-X caravanCand costs the bought deck, as caravanDeck does (RUNES-2a 3 step 2)", () => {
  it("switch off: every candidate costs buildCost of its deck and caravanDeck's value, as before; the same deck holding a HULL and a BELT rune is costed without them", () => withNpcDay(() => withSustain(() => {
    // FLIP-X2 (REQ-BFG-058, REQ-BFG-069): both switches are on by default now, so the switch-off world is botRunes false on
    // the candidate and the sustain switch off for the call (was the default for both)
    // AZ-BUMP (the flip, NPC_DAY): and NPC_DAY off, so the candidate is a road-less run whose deck the strict validator
    // reads (:262); with it on, a candidate's deck holds its road's gold and drops, which only the player mode with the
    // road log counts (tests/standin.caravan checks those)
    let n = 0;
    for (const hero of HEROES4) {
      for (let idx = 0; idx < 4; idx++) { // the policy mix: typical, typical, sharp, loose
        for (const day of [3, 7]) {
          const d = caravanCandidate(hero, day, 1, idx, STANDIN_MAX_STARS, false), at = `${hero} #${idx} d${day}`;
          const c = caravanCand(idx, d);
          expect(c.build.runes, at).toBeUndefined();
          expect(c.cost, at).toBe(buildCost(c.build).total); // bx's formula
          expect(c.cost, at).toBe(d.value);
          expect(c.code, at).not.toContain(" r:");
          // the same deck holding IRON SKIN (HULL) and TAR BARREL (BELT), their grants on the build as botTakeRune puts them
          const hull = RUNES.iron_skin.amount.n, belt = RUNES.tar_barrel.amount.n;
          const runed = { ...d, build: { ...cloneBuild(d.build), hullBonus: d.build.hullBonus + hull, beltCap: d.build.beltCap + belt, runes: rq("iron_skin", "tar_barrel") } };
          const r = caravanCand(idx, runed);
          expect(r.build.runes, at).toEqual(rq("iron_skin", "tar_barrel")); // the code carries them through the normalisation
          expect(r.cost, at).toBe(c.cost); // neither the rune's hull as plating nor its belt as crates
          expect(r.cost, at).toBe(boughtCost(r.build));
          expect(buildCost(r.build).total, at).toBeGreaterThan(r.cost); // what bx's formula would have charged
          expect(r.code.split("/").slice(1), at).toEqual(c.code.split("/").slice(1));
          expect(r.code.split("/")[0], at).toBe(`${d.build.beltCap + belt} ${d.build.hullBonus + hull}${loader.upgradeWord(d.build)} r:iron_skin,tar_barrel`);
          expect(validateBuild(r.build, day).errors, at).toEqual([]); // the validator reads the same bought deck
          n++;
        }
      }
    }
    expect(n).toBe(32);
    // AZ-BUMP (the flip): 600 s, a host timeout under the 1.5-CPU quota (the GATE RULE; 30 s hit in run 5's group check:
    // the candidates' runs fight a warlord every day), not the rule
  }, false), false), 600_000);

  it("botRunes on (the switch's test path): the candidate keeps its runes and costs caravanDeck's value", () => {
    for (let idx = 0; idx < 4; idx++) {
      const on = caravanCandidate("weaver", 6, 1, idx, STANDIN_MAX_STARS, true), c = caravanCand(idx, on);
      expect(on.build.runes).toHaveLength(6);
      expect(c.build.runes).toEqual(on.build.runes);
      expect(c.cost).toBe(on.value);
      expect(c.code).toContain(` r:${on.build.runes!.map((q) => q.id).join(",")}/`);
    }
    // AZ-BUMP (the flip): 600 s, a host timeout under the 1.5-CPU quota (the GATE RULE; 30 s hit in run 5's group check:
    // the candidates' runs fight a warlord every day), not the rule
  }, 600_000);
});

// ---------------------------------------------------------------- 3. CAPTAIN_RUNES and rivalBuild

describe("BOTS-X CAPTAIN_RUNES and rivalBuild (RUNES-2a 3 step 5's code)", () => {
  it("CAPTAIN_RUNES holds every captain's 10 runes (step 4.3), so every captain's rivalBuild(id, d), d = 1..10, is its plan's build holding the first d (captainRunesOn)", () => {
    // FLIP-X2 step 4.3 (b7ab24a): the table is filled (was: CAPTAIN_RUNES {} and rivalBuild exactly the plan's build)
    expect(Object.keys(CAPTAIN_RUNES).sort()).toEqual([...RIVAL_IDS].sort());
    let n = 0;
    for (const id of RIVAL_IDS) {
      expect(CAPTAIN_RUNES[id], id).toHaveLength(10);
      for (let d = 1; d <= 10; d++) {
        const b = rivalBuild(id, d), plan = rivalLoadout(id, d).build;
        expect(b, `${id} d${d}`).toEqual(captainRunesOn(plan, CAPTAIN_RUNES[id], d));
        expect(b.runes?.map((q) => q.id), `${id} d${d}`).toEqual(CAPTAIN_RUNES[id]!.slice(0, d));
        expect(lastKey(b), `${id} d${d}`).toBe("runes");
        n++;
      }
    }
    expect(n).toBe(190);
    const b = rivalLoadout("karsk", 5).build;
    expect(captainRunesOn(b, undefined, 5)).toBe(b);
    expect(captainRunesOn(b, [], 5)).toBe(b);
    expect(captainRunesOn(b, ["iron_skin"], 0)).toBe(b);
  });

  it("a sample list (botRuneList on the captain's seed): rivalBuild on day d holds exactly the first d runes, their HULL and BELT, and passes runeProblem with that seed", () => {
    const sample = HEROES4.map((hero) => RIVAL_IDS.find((id) => RIVALS[id].hero === hero)!);
    expect(new Set(sample.map((id) => RIVALS[id].hero)).size).toBe(4);
    const table = CAPTAIN_RUNES as Partial<Record<RivalId, readonly string[]>>;
    const before = JSON.stringify(CAPTAIN_RUNES);
    for (const id of sample) {
      const hero = RIVALS[id].hero, seed = hashSeed("captain-runes", id);
      const list = botRuneList(seed, hero, (d) => rivalBuild(id, d), 10);
      expect(list, id).toHaveLength(10);
      // FLIP-X2: the pinned list IS this list (step 4.3 generated it so); the real list is put back below (was: deleted,
      // the table being empty)
      const real = table[id];
      expect(list, id).toEqual(real);
      table[id] = list; // rivalBuild reads CAPTAIN_RUNES[id]; put back below
      try {
        for (let d = 1; d <= 10; d++) {
          const at = `${id} d${d}`, plan = rivalLoadout(id, d).build, b = rivalBuild(id, d), held = rq(...list.slice(0, d));
          const g = runeGrants(held, d);
          expect(b.runes, at).toEqual(held);
          expect(lastKey(b), at).toBe("runes");
          expect(b.hullBonus, at).toBe(plan.hullBonus + g.hull);
          expect(b.beltCap, at).toBe(plan.beltCap + g.belt);
          const { runes: _r, ...rest } = b;
          expect({ ...rest, hullBonus: plan.hullBonus, beltCap: plan.beltCap }, at).toEqual(plan);
          expect(runeProblem(b.runes, d, hero, seed), at).toBeNull();
          expect(b, at).toEqual(captainRunesOn(plan, list, d));
        }
      } finally {
        table[id] = real;
      }
      expect(rivalBuild(id, 10)).toEqual(captainRunesOn(rivalLoadout(id, 10).build, real, 10)); // FLIP-X2: was the bare plan
    }
    expect(JSON.stringify(CAPTAIN_RUNES)).toBe(before); // FLIP-X2: the table as it was (was toEqual({}))
    // HULL and BELT runes on the build by day (a hand-made list: SPARE HULL taken on day 3)
    const plan = rivalLoadout("grimhold", 6).build, list = ["iron_skin", "tar_barrel", "spare_hull", "war_edge"];
    const hull = (d: number) => captainRunesOn(plan, list, d).hullBonus - plan.hullBonus, belt = (d: number) => captainRunesOn(plan, list, d).beltCap - plan.beltCap;
    const skin = RUNES.iron_skin.amount.n, spare = RUNES.spare_hull.amount.n, tar = RUNES.tar_barrel.amount.n;
    expect([skin, spare, tar].every((x) => x > 0)).toBe(true);
    expect([1, 2, 3, 4, 10].map(hull)).toEqual([skin, skin, skin + spare, skin + spare, skin + spare]);
    expect([1, 2, 3, 4, 10].map(belt)).toEqual([0, tar, tar, tar, tar]);
    expect(captainRunesOn(plan, list, 10).runes).toEqual(rq(...list));
  });
});

// ---------------------------------------------------------------- 4. botRunePick reads runeList()

describe("BOTS-X botRunePick reads runeList() (REVIEW-SUSD F-c, SUS-D finding 7)", () => {
  const empty = (hero: HeroId): Build => ({ hero, items: [], routes: [], mods: [], beltCap: 0, hullBonus: 0 });

  it("switch off: runeList() is RUNE_LIST and every pick is bx's (real offers of every hero, seeds 1-40, days 1-10, on three boards)", () => withSustain(() => {
    // FLIP-X2 (REQ-BFG-069): the switch is on by default, so the switch-off world is withSustain(fn, false) (was the default).
    // FLIP-X2 (REVIEW-TUNEX): runeList() never holds a dormant rune, so off it is RUNE_LIST without COAL CHUTE and HEAT SINK,
    // 55 (was RUNE_LIST itself, 57); no dawn offers a dormant rune, so every real offer's pick is still bx's
    expect(runeList().map((d) => d.id)).toEqual(RUNE_LIST.filter((d) => !DORMANT_RUNES.has(d.id)).map((d) => d.id));
    expect(runeList()).toHaveLength(57); // BAL-2 (REVIEW-BAL1 row 2): DORMANT_RUNES is empty, so off it is RUNE_LIST, 57 (was 55)
    let n = 0;
    for (const hero of RUNE_HEROES) {
      const captain = RIVAL_IDS.find((id) => RIVALS[id].hero === hero);
      for (let day = 1; day <= 10; day++) {
        const boards = HEROES4.includes(hero) ? [empty(hero), heroStartBuild(hero), rivalBuild(captain!, day)] : [empty(hero)];
        for (let seed = 1; seed <= 40; seed++) {
          const offer = runeOffer(seed, day, hero, []);
          for (const b of boards) {
            expect(botRunePick(offer, hero, b), `${hero} s${seed} d${day}`).toBe(bxPick(offer, hero, b));
            expect(botRunePick([...offer.ids].reverse(), hero, b)).toBe(bxPick(offer, hero, b));
            n++;
          }
        }
      }
    }
    expect(n).toBe(4 * 10 * 40 * 3 + (RUNE_HEROES.length - 4) * 10 * 40);
    // a sustain rune is no card while the switch is off, as on bx
    expect(botRunePick(["bulwark_ward", "iron_skin", "coin_purse"], "bastion", empty("bastion"))).toBe("iron_skin");
    expect(botRunePick(["green_thread"], "weaver", empty("weaver"))).toBeNull();
  }, false));

  it("switch on (withSustain): an offered sustain rune of the hero's style is its pick, BULWARK WARD and TICK GUARD for BASTION, TWIN SALVE for FOUNDRY, GREEN THREAD for WEAVER, SEARING and SHATTER SHOT for FURNACE", () => {
    const style: [HeroId, string][] = [["bastion", "bulwark_ward"], ["bastion", "tick_guard"], ["foundry", "twin_salve"], ["weaver", "green_thread"], ["furnace", "searing"], ["furnace", "shatter_shot"]];
    for (const [hero, id] of style) expect(RUNES[id].theme).toBe(HERO_STYLE[hero]);
    // FLIP-X2 (REVIEW-TUNEX): SEARING and SHATTER SHOT are dormant (DORMANT_RUNES): runeList() leaves them out, so the picker
    // never takes one, even handed it (no dawn offers it), and FURNACE has no sustain rune of its style to take (was its pick)
    const dormant = (id: string) => DORMANT_RUNES.has(id);
    // BAL-2 (REVIEW-BAL1 row 2): DORMANT_RUNES is empty, so SEARING and SHATTER SHOT are FURNACE's picks again (was
    // ["searing", "shatter_shot"], dormant)
    expect(style.filter(([, id]) => dormant(id)).map(([, id]) => id)).toEqual([]);
    withSustain(() => {
      // FLIP-X2: the 65 less the 4 dormant, 61 (was RUNE_LIST and the 8 sustain runes, 65). BAL-2: none dormant, 65 (was 61)
      const live = (l: readonly RuneDef[]) => l.filter((d) => !dormant(d.id));
      expect(runeList()).toEqual(live([...RUNE_LIST, ...SUSTAIN_RUNE_LIST]));
      expect(runeList()).toHaveLength(65);
      for (const [hero, id] of style) {
        const b = heroStartBuild(hero);
        if (dormant(id)) { // FLIP-X2: the dormant one is no card: the pick is as if it weren't there (was id)
          expect(botRunePick(["iron_skin", id, "coin_purse"], hero, b), `${hero} ${id}`).toBe(botRunePick(["iron_skin", "coin_purse"], hero, b));
          expect(botRunePick([id, "war_edge"], hero, b), `${hero} ${id}`).toBe("war_edge");
          expect(botRunePick({ day: 5, tier: "rare", drawn: "rare", ids: ["scrap_medic", id] }, hero, b), `${hero} ${id}`).toBe("scrap_medic");
          continue;
        }
        expect(botRunePick(["iron_skin", id, "coin_purse"], hero, b), `${hero} ${id}`).toBe(id);
        expect(botRunePick([id, "war_edge"], hero, b), `${hero} ${id}`).toBe(id);
        expect(botRunePick({ day: 5, tier: "rare", drawn: "rare", ids: ["scrap_medic", id] }, hero, b), `${hero} ${id}`).toBe(id);
      }
      // ties go by runeList() order: a catalogue style rune before a sustain one, whatever the card order
      expect(botRunePick(["bulwark_ward", "rivet_hoard"], "bastion", empty("bastion"))).toBe("rivet_hoard");
      expect(botRunePick(["tick_guard", "bulwark_ward"], "bastion", empty("bastion"))).toBe("bulwark_ward");
      // the generic sustain runes count their themes like any rune: LEECH VOW (turrets) on a board of turrets and no
      // bought hull, SCRAP MEDIC (armor) on a board whose bought hull outnumbers its turrets
      const guns = empty("metronome"), packs = (n: number): Build => ({ ...guns, hullBonus: n * ITEMS.plating.supply!.hull! });
      expect(boardThemeCount("armor", guns)).toBe(0);
      expect(boardThemeCount("turrets", guns)).toBeGreaterThan(0);
      expect(botRunePick(["scrap_medic", "leech_vow"], "metronome", guns)).toBe("leech_vow");
      expect(boardThemeCount("armor", packs(9))).toBeGreaterThan(boardThemeCount("turrets", guns));
      expect(botRunePick(["leech_vow", "scrap_medic"], "metronome", packs(9))).toBe("scrap_medic");
      // real offers (days 3-10, past any day-3 hold): a bot takes an offered sustain rune of its style when no catalogue
      // rune of its style is offered with it, and an offer without a sustain rune is picked exactly as bx picked it
      const sustain = new Set(SUSTAIN_RUNE_LIST.map((d) => d.id));
      for (const hero of HEROES4) {
        const took = new Set<string>();
        for (let day = 3; day <= 10; day++) {
          const b = heroStartBuild(hero);
          for (let seed = 1; seed <= 150; seed++) {
            const offer = runeOffer(seed, day, hero, []), pick = botRunePick(offer, hero, b);
            expect(offer.ids).toContain(pick);
            const mine = runeList().filter((d) => offer.ids.includes(d.id) && d.theme === HERO_STYLE[hero]);
            if (mine.length) expect(pick).toBe(mine[0].id);
            if (!offer.ids.some((id) => sustain.has(id))) expect(pick).toBe(bxPick(offer, hero, b));
            else if (pick !== null && sustain.has(pick)) took.add(pick);
          }
        }
        const want = style.filter(([h]) => h === hero).map(([, id]) => id);
        // FLIP-X2 (REVIEW-TUNEX): FURNACE's two are dormant, so it takes none of them (was > 0 for every hero)
        if (want.every(dormant)) expect([...took].filter((id) => want.includes(id)), `${hero} took ${[...took].join(", ")}`).toEqual([]);
        else expect([...took].filter((id) => want.includes(id)).length, `${hero} took ${[...took].join(", ")}`).toBeGreaterThan(0);
      }
    });
    // the switch is back (FLIP-X2: on, the default now; was "back off", runeList() RUNE_LIST)
    expect(runeList().map((d) => d.id)).toEqual([...RUNE_LIST, ...SUSTAIN_RUNE_LIST].filter((d) => !dormant(d.id)).map((d) => d.id));
  });
});

// ---------------------------------------------------------------- 5. the captains' generator counts runeList()

describe("BOTS-X tools/genCaptainRunes.ts counts runeList() (REVIEW-SUSD F-d)", () => {
  it("its header counts runeList(): 55 with the switch off, 61 with it on (importing it writes nothing; no list is computed)", () => {
    const none = Object.fromEntries(RIVAL_IDS.map((id) => [id, []])) as unknown as Record<RivalId, string[]>;
    const head = () => captainRunesText(none).split("\n")[0];
    expect(head()).toContain(`, ${runeList().length} runes in the catalogue.`);
    // FLIP-X2 (REQ-BFG-069; REVIEW-TUNEX): the switch is on by default, so off is withSustain(head, false); runeList() leaves
    // the dormant runes out (COAL CHUTE and HEAT SINK off; SEARING and SHATTER SHOT too on): 55 off and 61 on (was 57 off,
    // the default, and 65 on)
    // BAL-2 (REVIEW-BAL1 row 2): DORMANT_RUNES is empty: 57 off and 65 on (was 55 and 61)
    expect(withSustain(head, false)).toContain(", 57 runes in the catalogue.");
    expect(head()).toContain(", 65 runes in the catalogue.");
    expect(withSustain(head)).toContain(", 65 runes in the catalogue.");
  });
});
