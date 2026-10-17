// OPEN-1 (REQ-BFG-109; BRIEF-OPEN1 4c-4d; cap's call, oracle request 3360bc59b3a473f1): with OPEN_RUNES on, no rune is dead
// for any hero. A rune is DEAD for a hero when no deck that hero can build makes it do anything (BRIEF-OPEN1 section 4).
//
// THE FIXED DECKS, per hero, each legal for that hero by the game's own strict check (validate.ts validateBuild "strict":
// the hull's slots and intakes, what a shop sells, the belt and the day's budget), all from the par player (harness/par.ts
// parField, members 1-2, bare: no runes of their own; built with the switch on, as the game builds them):
//  1. its par decks of days 3, 6 and 9;
//  2. a PART deck for each shop part a rune family keys on: HEAT (COAL CHUTE, HEAT SINK): a HEAT JACKET; FRAY (DOUBLE
//     KNOT, SNARE KNOT, BARBED SILK, WIDOW'S WEB, LOOM OF WOE): a BARBED SPOOL; PLATE (IRON TEMPER, BULWARK OATH): a PLATE
//     ROLLER. The HEAT deck holds a HEAT JACKET (cap's call); the FRAY and PLATE decks are the first par deck the family's
//     rune fires on. Without one: a par deck (days 9, 6, 3) with one of its one-tile rigs made the part (on its tile, in
//     any of the four turns), cheaper rigs dropped while the day's budget is short, passing the strict check and firing;
//  3. a two-intake deck (the seven PAIR runes): the first par deck with one turret fed by two belts through two intakes,
//     else (WEAVER: its DART GUNs take one belt each) a par deck with a CARRONADE (two intakes, any hero's shop) in a slot
//     one of its belts feeds and another of its belts laid anew, shortest, into the other intake (the harness's own path
//     search), the belts that fed nothing else dropped while the belt is short and cheaper rigs while the budget is.
// HULL-ON (the flip, FREE_JOINS; cap's ruling 6f4568477e66a600 item 2), the one exception: when a part deck's two ways find
// nothing on these par decks, the same two ways run on the JOIN-LIMITED par decks (the same parField call with FREE_JOINS
// off: at most 2 joins per deck, so a deck the hero can build under bb-0.10.0 too), labelled "join-limited par day 9 #1:
// ...". Everything else is the shipped world's: the par decks of days 3, 6 and 9, the two-intake deck, the foes, every
// fight and every strict check.
// BUMP-1D (the long run, PLAIN_RIGS and SHAPES2 on), the same exception for the two-intake deck: FURNACE's par decks of days 3, 6
// and 9 (members 1-2) are now one belt, or one belt and a belt joining it, so neither way finds two belts and an intake to feed;
// then the two ways run on the join-limited par decks too (twoDeck's second tier, labelled "join-limited par day 9 #2: ...").
// (Measured: with the long run off, or with PLAIN_RIGS and SHAPES2 off, FURNACE's member 2 of each of the three days is still on
// two belts into one turret; the par player's draws moved with the three switches on together, not by any rule.)
// Each fights each hero's par deck of that day (member 1, bare) once, from side 0, on a fixed seed; the part decks first.
// A rune FIRES in a fight when anything in the battle's record differs from the same fight without it (the sim
// fingerprint's record: the winner, the time, both hulls, every SideStats field and a tally of every sim event). The test
// reads its runes from the RUNES table (a rune added later is checked too) and stops at a rune's first firing fight. The
// run's gold and BELT runes act before the fight, on the shop and the board (every hero spends gold and lays belts): not
// checked here. Deterministic.
import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { Battle } from "../src/sim/battle";
import { ITEMS, type HeroId } from "../src/sim/content";
import { beltUsed, cloneBuild, connectorClaims, feedOf, hero, hullSlots, itemByUid, kx, ky, setTurretList, turretList, type Build } from "../src/sim/deck";
import { parField } from "../src/sim/harness/par";
import { blockedCells, randomPath, shortestTiles, startCells } from "../src/sim/harness/path";
import { LONG_ROAD_PCT, OPEN_RUNE_DEFS, openRunesRules, withOpenRunes } from "../src/sim/openRunes";
import { withFreeJoins } from "../src/sim/freeJoins"; // HULL-ON (FREE_JOINS; cap's ruling 6f4568477e66a600 item 2): the part decks' join-limited tier
import { RUNES, type RuneDef } from "../src/sim/runes";
import { validateBuild } from "../src/net/validate";
import { npcDayRules } from "../src/sim/npcDay"; // HULL-ON (NPC_DAY ships on): the par decks' budget line (strictBut)
import { RUNE_TEXT, runeReminder, runeSentenceSpans } from "../src/ui/runeText";
import { BAND, px } from "./y3.helpers";

const HEROES: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const DAYS = [3, 6, 9];
const MEMBERS = 2;
/** The run's kinds the battle can't see: gold before the fight, BELT to lay. */
const RUN_KINDS: ReadonlySet<string> = new Set(["dawnGold", "runeTithe", "victorGold", "belt"]);
/** The shop parts a rune family keys on, and the family's rune that proves a deck's part works. */
const PARTS = [
  { key: "HEAT", part: "heatjacket", probe: "coal_chute", mustHold: true },
  { key: "FRAY", part: "barbed", probe: "snare_knot", mustHold: false }, // the family's hardest: the foe's FRAY full
  { key: "PLATE", part: "plateroller", probe: "iron_temper", mustHold: false },
] as const;

const stats = (s: unknown): unknown[] => { const o = s as Record<string, unknown>; return Object.keys(o).sort().map((k) => [k, o[k]]); };

/** One battle, stepped as the sim fingerprint steps it: its whole record as a string. */
function record(a: Build, b: Build, seed: number, day: number): string {
  const bt = new Battle(cloneBuild(a), cloneBuild(b), seed, [Math.floor((day - 1) / 2), 0], day);
  const tally: Record<string, number> = {};
  while (!bt.over && bt.ticks < 60 * 200) {
    bt.step();
    for (const e of bt.events) tally[e.type] = (tally[e.type] ?? 0) + 1;
    bt.events.length = 0;
  }
  return JSON.stringify([bt.winner, bt.t, bt.ticks, bt.sides[0].hull.hp, bt.sides[1].hull.hp, stats(bt.sides[0].stats), stats(bt.sides[1].stats), Object.keys(tally).sort().map((k) => [k, tally[k]])]);
}

/** `b` holding rune `d` alone, as run.ts takeRune applies it (a HULL rune's amount on hullBonus, a BELT rune's on beltCap). */
function withRune(b: Build, d: RuneDef): Build {
  const out = cloneBuild(b);
  out.runes = [{ id: d.id }];
  if (d.kind === "hull") out.hullBonus += d.amount.n;
  else if (d.kind === "belt") out.beltCap += d.amount.n;
  return out;
}

interface Fixed { label: string; day: number; build: Build }

/** The par decks (members 1..MEMBERS, bare) by hero and day, built once (inside the switch, as the game builds them). */
const PAR = new Map<string, Build[]>();
const pars = (h: HeroId, day: number): Build[] => {
  const k = `${h}:${day}`;
  if (!PAR.has(k)) PAR.set(k, parField(h, day, MEMBERS, { botRunes: false }));
  return PAR.get(k)!;
};
/** HULL-ON (the flip, FREE_JOINS; cap's ruling 6f4568477e66a600 item 2): the join-limited par decks, for the part decks'
 *  fallback tier only (partDeck). The same parField call with FREE_JOINS off (at most 2 joins per deck), cached under its
 *  own key, not PAR's: a deck the hero can build under bb-0.10.0 too (the strict check takes any number of legal joins). */
const joinLimitedPars = (h: HeroId, day: number): Build[] => {
  const k = `join-limited:${h}:${day}`;
  if (!PAR.has(k)) PAR.set(k, withFreeJoins(() => parField(h, day, MEMBERS, { botRunes: false }), false));
  return PAR.get(k)!;
};
const foeOf = (h: HeroId, day: number): Build => pars(h, day)[0];
const seedOf = (h: HeroId, day: number, deck: number, foe: number): number => 7919 * day + 104729 * deck + 31 * foe + HEROES.indexOf(h);

/** Does rune `id` fire for `b` (a deck of `h` on `day`) against any hero's par deck of that day? */
function firesIn(h: HeroId, b: Build, day: number, id: string): boolean {
  return HEROES.some((foe, j) => {
    const seed = seedOf(h, day, 99, j);
    return record(withRune(b, RUNES[id]), foeOf(foe, day), seed, day) !== record(b, foeOf(foe, day), seed, day);
  });
}

/** One turret fed by two belts through two of its intakes (the PAIR runes' way, any hero). */
function twoIntakeFed(b: Build): boolean {
  const claims = connectorClaims(b);
  return hero(b).turrets.some((t) => t.connectors.filter((c) => claims.has(c) && feedOf(b, claims.get(c)!, claims).connected).length >= 2);
}

const strict = (b: Build, day: number): string[] => validateBuild(b, day, "strict").errors;
/** HULL-ON (NPC_DAY, on since AZ-BUMP's flip def6e73): the par player fights the Medium warlord every day, so a par deck is
 *  road-fed: legal by every strict line but the budget's, which is the road's rule (the road's gold and drops count only in
 *  the player mode with the road log), as the flip converted harness.player.test.ts (its strictBut). Off: strict as is. */
const strictBut = (b: Build, day: number): string[] => strict(b, day).filter((e) => !(npcDayRules() && e.startsWith("budget: ")));

/** `c` with its cheapest rigs (not in `keep`) dropped one by one while the strict check says only that the day's budget is
 *  short; null when another check fails or no rig is left to drop. */
function affordable(c: Build, day: number, keep: ReadonlySet<number>): Build | null {
  for (let n = 0; n < 16; n++) {
    const errors = strict(c, day);
    if (!errors.length) return c;
    if (!errors.every((e) => e.startsWith("budget"))) return null;
    const rigs = c.items.filter((p) => ITEMS[p.def].kind === "gate" && !keep.has(p.uid)).sort((a, b) => ITEMS[a.def].price - ITEMS[b.def].price || a.uid - b.uid);
    if (!rigs.length) return null;
    c = cloneBuild(c);
    c.items = c.items.filter((p) => p.uid !== rigs[0].uid);
  }
  return null;
}

/** 2. A part deck (see the header): its two ways on the par decks. HULL-ON (the flip, FREE_JOINS; cap's ruling
 *  6f4568477e66a600 item 2): only when they find nothing, the same two ways on the join-limited par decks (joinLimitedPars);
 *  the fights and the strict check stay the shipped world's. */
function partDeck(h: HeroId, part: string, probe: string, mustHold: boolean): Fixed | null {
  return partTiers(h, part, probe, mustHold, pars, "par") ?? partTiers(h, part, probe, mustHold, joinLimitedPars, "join-limited par");
}

/** partDeck's two ways on the par decks `src` gives (labelled `name`). */
function partTiers(h: HeroId, part: string, probe: string, mustHold: boolean, src: (h: HeroId, day: number) => Build[], name: string): Fixed | null {
  for (const day of [9, 6, 3]) {
    for (const [i, b] of src(h, day).entries()) {
      if (mustHold && !b.items.some((p) => p.def === part)) continue;
      if (firesIn(h, b, day, probe)) return { label: `${name} day ${day} #${i + 1}${b.items.some((p) => p.def === part) ? ` (its own ${ITEMS[part].name})` : ""}`, day, build: b };
    }
  }
  for (const day of [9, 6, 3]) {
    for (const [i, b] of src(h, day).entries()) {
      for (const p of b.items) {
        const d = ITEMS[p.def];
        if (d.kind !== "gate" || d.size !== 1 || p.def === part) continue;
        for (const stars of [...new Set([p.stars ?? 1, 1])]) for (const rot of [p.rot ?? 0, 0, 1, 2, 3].filter((r, k, a) => a.indexOf(r) === k)) {
          const c = cloneBuild(b);
          const q = c.items.find((x) => x.uid === p.uid)!;
          q.def = part;
          if (stars > 1) q.stars = stars;
          else delete q.stars;
          if (rot) q.rot = rot;
          else delete q.rot;
          const e = affordable(c, day, new Set([p.uid]));
          if (e && firesIn(h, e, day, probe)) return { label: `${name} day ${day} #${i + 1}: its ${d.name} at (${p.x}, ${p.y}) made a ${stars > 1 ? `★${stars} ` : ""}${ITEMS[part].name} (turn ${rot}), ${b.items.length - e.items.length} cheaper rig(s) dropped`, day, build: e };
        }
      }
    }
  }
  return null;
}

/** Drop route `r` and every belt joining into it (route indices shift; joins name cells). */
function dropRoute(b: Build, r: number): void {
  const cells = new Set(b.routes[r].cells);
  b.routes.splice(r, 1);
  for (let q = b.routes.length - 1; q >= 0; q--) if (b.routes[q].join !== undefined && cells.has(b.routes[q].join!)) dropRoute(b, q);
}

/** 3. The two-intake deck (see the header): its two ways on the par decks. BUMP-1D (the long run, PLAIN_RIGS and SHAPES2 on; the
 *  par player's draws moved with the three together): only when they find nothing, the same two ways on the join-limited par
 *  decks (joinLimitedPars, partDeck's second tier). FURNACE's par decks of days 3, 6 and 9 (members 1-2) are now ONE belt, or one
 *  belt and a belt joining it (no belt of its own to lay anew into a second intake); the same call with FREE_JOINS off (at most
 *  2 joins) has FURNACE's member 2 on two belts into one turret on all three days. The fights and the strict check stay the
 *  shipped world's. */
function twoDeck(h: HeroId): Fixed | null {
  return twoTiers(h, pars, "par") ?? twoTiers(h, joinLimitedPars, "join-limited par");
}

/** twoDeck's two ways on the par decks `src` gives (labelled `name`). */
function twoTiers(h: HeroId, src: (h: HeroId, day: number) => Build[], name: string): Fixed | null {
  for (const day of [9, 6, 3]) {
    for (const [i, b] of src(h, day).entries()) if (twoIntakeFed(b) && firesIn(h, b, day, "twin_nails")) return { label: `${name} day ${day} #${i + 1} (its own two-intake turret on two belts)`, day, build: b };
  }
  for (const day of [9, 6, 3]) {
    for (const [i, b] of src(h, day).entries()) {
      const slots = hullSlots(h);
      for (let s = 0; s < slots.length; s++) {
        const c = cloneBuild(b);
        const uid = 1 + Math.max(0, ...c.items.map((p) => p.uid), ...c.mods.map((m) => m.uid), ...turretList(c).map((t) => t.uid));
        setTurretList(c, [...turretList(c).filter((t) => t.slot !== s), { slot: s, def: "carronade", uid }]);
        c.mods = c.mods.filter((m) => m.turret !== s); // the old turret's gear goes with it
        const cols = hero(c).turrets[s].connectors;
        const claims = connectorClaims(c);
        const fed = cols.filter((col) => claims.has(col) && feedOf(c, claims.get(col)!, claims).connected);
        if (fed.length !== 1) continue;
        const want = cols.find((col) => !fed.includes(col))!;
        const keepRoute = claims.get(fed[0])!;
        for (let r = 0; r < c.routes.length; r++) {
          const route = c.routes[r];
          if (route.join !== undefined || r === keepRoute) continue;
          const f = itemByUid(c, route.factory);
          if (!f) continue;
          const bl = blockedCells(c, r);
          const starts = startCells(f.x, f.y, ITEMS[f.def].size, bl);
          const n = shortestTiles(bl, starts, want);
          if (!Number.isFinite(n)) continue;
          const path = randomPath(bl, starts, want, n, new Rng(1));
          if (!path) continue;
          const e = cloneBuild(c);
          const old = new Set(e.routes[r].cells);
          e.routes[r] = { ...e.routes[r], cells: path };
          for (let q = e.routes.length - 1; q >= 0; q--) if (e.routes[q].join !== undefined && old.has(e.routes[q].join!) && !path.includes(e.routes[q].join!)) dropRoute(e, q);
          // the belt: drop the longest belts that feed neither intake while it is short
          const keepCells = (x: Build): Set<number> => new Set(x.routes.filter((rt) => { const last = rt.cells[rt.cells.length - 1]; return rt.join === undefined && last !== undefined && cols.includes(kx(last)) && ky(last) === 0; }).flatMap((rt) => rt.cells));
          let guard = 0;
          while (beltUsed(e) > e.beltCap && guard++ < 8) {
            const kc = keepCells(e);
            const cand = e.routes.map((rt, q) => ({ q, n: rt.cells.length, keep: rt.cells.some((k) => kc.has(k)) })).filter((x) => !x.keep).sort((x, y) => y.n - x.n || x.q - y.q);
            if (!cand.length) break;
            dropRoute(e, cand[0].q);
          }
          if (beltUsed(e) > e.beltCap || !twoIntakeFed(e)) continue;
          const ok = affordable(e, day, new Set());
          if (ok && twoIntakeFed(ok) && firesIn(h, ok, day, "twin_nails")) {
            return { label: `${name} day ${day} #${i + 1}: a CARRONADE in slot ${s + 1}, a belt laid anew into intake ${want} (${b.routes.length - ok.routes.length} belt(s), ${b.items.length - ok.items.length} rig(s) dropped)`, day, build: ok };
          }
        }
      }
    }
  }
  return null;
}

interface HeroDecks { decks: Fixed[]; parts: Record<string, Fixed | null>; two: Fixed | null }
/** The fixed decks of every hero, built once inside the switch. */
let FIXED: Map<HeroId, HeroDecks> | null = null;
function fixedDecks(): Map<HeroId, HeroDecks> {
  if (FIXED) return FIXED;
  FIXED = new Map();
  for (const h of HEROES) {
    const parts: Record<string, Fixed | null> = {};
    for (const p of PARTS) parts[p.key] = partDeck(h, p.part, p.probe, p.mustHold);
    const two = twoDeck(h);
    const decks = [...Object.values(parts), two, ...DAYS.flatMap((day) => pars(h, day).map((b, i) => ({ label: `par day ${day} #${i + 1}`, day, build: b })))].filter((x): x is Fixed => !!x);
    FIXED.set(h, { decks, parts, two });
  }
  return FIXED;
}

/** The (hero, rune) pairs whose rune fires in none of the hero's fixed fights. */
function deadPairs(): string[] {
  const dead: string[] = [];
  for (const h of HEROES) {
    // round robin: every deck's first fight, then every deck's second, ... (a rune that needs one deck meets it early)
    const decks = fixedDecks().get(h)!.decks;
    const fights = HEROES.flatMap((foe, j) => decks.map((f, i) => ({ mine: f.build, foe: foeOf(foe, f.day), day: f.day, seed: seedOf(h, f.day, i, j) })));
    const base: (string | undefined)[] = [];
    const baseOf = (i: number): string => (base[i] ??= record(fights[i].mine, fights[i].foe, fights[i].seed, fights[i].day));
    for (const d of Object.values(RUNES)) {
      if (RUN_KINDS.has(d.kind)) continue;
      const fires = fights.some((f, i) => record(withRune(f.mine, d), f.foe, f.seed, f.day) !== baseOf(i));
      if (!fires) dead.push(`${h}:${d.id}`);
    }
  }
  return dead;
}

describe("OPEN-1: no rune is dead for any hero (REQ-BFG-109)", () => {
  it("each hero has a legal HEAT JACKET deck, FRAY and PLATE part decks and a two-intake deck (the game's strict check), as its par decks are legal", () => {
    const lines = withOpenRunes(() => {
      const out: string[] = [];
      for (const [h, f] of fixedDecks()) {
        for (const p of PARTS) expect(f.parts[p.key], `${h}: a ${p.key} deck`).not.toBeNull();
        expect(f.two, `${h}: a two-intake deck`).not.toBeNull();
        expect(f.parts.HEAT!.build.items.some((p) => p.def === "heatjacket")).toBe(true);
        expect(twoIntakeFed(f.two!.build)).toBe(true);
        // HULL-ON (NPC_DAY): the par decks' budget is the road's rule (strictBut); every other strict line stands
        for (const d of f.decks) expect(strictBut(d.build, d.day), `${h}: ${d.label}`).toEqual([]);
        out.push(`${h}: ${PARTS.map((p) => `${p.key} ${f.parts[p.key]!.label}`).join("; ")}; PAIR ${f.two!.label}`);
      }
      return out;
    });
    expect(openRunesRules()).toBe(true); // HULL-ON (the flip, OPEN_RUNES): withOpenRunes puts back the shipped value, on (was false)
    console.log(lines.join("\n"));
    // HULL-ON (the flip, FREE_JOINS; cap's ruling 6f4568477e66a600 item 2), rule 6: 60 s -> 140 s. WEAVER's HEAT and PLATE
    // searches on the shipped par decks now run in full and find nothing, and the join-limited tier adds 3 parField calls
    // and its own searches: measured 65.7 s in a t1 run of this file alone (19:54Z), so at least 2x that
  }, 140_000);

  it("with OPEN_RUNES on, every rune of the RUNES table fires for every hero in at least one of its fixed decks", () => {
    const dead = withOpenRunes(() => deadPairs());
    expect(openRunesRules()).toBe(true); // HULL-ON (the flip, OPEN_RUNES): withOpenRunes puts back the shipped value, on (was false)
    expect(dead).toEqual([]);
  }, 60_000);

  // HULL-ON (the flip, OPEN_RUNES): "off, the very base def" needs the switch off; it ships on, so the test sets it off
  // itself (base = the off catalogue's def, read before the on half and again after it)
  it("THE LONG ROAD's rewrite: open, +6% DMG PER RIG A LOAD PASSES (priorPct), name, tier, theme kept, its card lines in the band; off, the very base def", () => withOpenRunes(() => {
    const base = RUNES.long_road;
    expect(Object.keys(OPEN_RUNE_DEFS)).toEqual(["long_road"]);
    expect(base.kind).toBe("rideMul");
    withOpenRunes(() => {
      const d = RUNES.long_road;
      expect(d).not.toBe(base);
      expect([d.id, d.name, d.tier, d.theme]).toEqual([base.id, base.name, base.tier, base.theme]);
      expect([d.kind, d.amount, d.text]).toEqual(["priorPct", { unit: "pct", n: LONG_ROAD_PCT }, RUNES.toll_road.text]);
      expect(RUNE_TEXT.long_road).toBeUndefined();
      const drawn = runeSentenceSpans(d).map((l) => l.map((sp) => sp.t).join(""));
      expect(drawn).toEqual([`+${LONG_ROAD_PCT}% DMG PER RIG A LOAD PASSES.`]);
      for (const l of drawn) expect(px(l), l).toBeLessThanOrEqual(BAND);
      expect(runeReminder(d)).toBe(runeReminder(RUNES.toll_road));
    });
    expect(RUNES.long_road).toBe(base);
  }, false));
});
