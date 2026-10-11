// HULL-1d (REQ-BFG-079, REQ-BFG-073, REQ-BFG-078; BRIEF-HULL1D 2 (g)): the server with every switch on. NPC_DAY, HULL_SCALE and
// LADDER_FIX on together, as AZ-BUMP will ship them (each through its setter; every test puts all three back on, the shipped
// value, afterEach; AZ-BUMP's flip, was off).
// 1. Honest uploads pass, for every hero the game offers (heroBuilds.ts PLAYABLE_HEROES, the bb-0.9.7 rules' heroes), days
//    1-10: the upload driver's runs (tests/uploadDriver.ts: bought decks, the NPC day's fight, event and REFIT, its LAST CHANCE
//    drawn from the offer), and scripted runs through the game's own rules that take each LAST CHANCE card (RUNE, PART at ★2,
//    HULL), win drops at each tier (Easy, Medium, Hard at ★2; the Matriarch's part), buy ARMOR PACKs and take HULL runes, so
//    build.hullBonus carries every flat grant in day-1 units and the battle's max hull is M(d) x (base + hullBonus).
// 2. Forgeries are refused with every switch on, each its own test, the server's line matched loosely: POST /v1/ghosts's own
//    checks in its order (server/app.ts: the strict decoder's 400, validateUpload's 422 "deck failed validation", the
//    record's 422), and end to end through the server for the record lines. What is NOT refused is an `it.fails`, with its
//    repro (the findings, REPORT HULL-1d (g)).
// The server's data dir is under os.tmpdir() (run with TMPDIR set).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Battle, type SideStats } from "../src/sim/battle";
import { GRID, HEROES, ITEMS, RULES_VERSION, START_GOLD, incomeFor, type HeroId } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { DROP_STARS, dropClass, dropPool, roadDropValue, setNpcDay, npcDayRules, type RoadEntry } from "../src/sim/npcDay";
import { dayMulTenths, hullAt, hullScaleRules, incomeOn, scaleTenths, setHullScale } from "../src/sim/hullScale";
import { ladderFixRules, setLadderFix } from "../src/sim/ladderFix";
import { LAST_CHANCE_HULL, LAST_CHANCE_PART_STARS, lastChanceParts, lastChancePartStars, type Boon } from "../src/sim/lastChance";
import { RUNES, runeFits, runeList } from "../src/sim/runes";
import { starField, starsOf, valueOf } from "../src/sim/stars";
import { canFitGear, canPlaceItem, hullSlots, placeItem, rotField, turretList, turretSlots, type Build } from "../src/sim/deck";
import { DIFFICULTIES, RIVALS, warlordOffer, type Difficulty, type RivalId } from "../src/sim/rivals";
import { choicesFor, eventFor, pickChoice } from "../src/game/events";
import { finishDay, ghostOf } from "../src/game/day";
import { finishWarlord, leaveCaravan, onToTheRoad, pickRoad, warlordDeck, warlordDrop } from "../src/game/road";
import { buyPack, fitCore, installFromCargo, newRun, pendingLastChance, pendingRune, takeFromInventory, takeLastChance, takeRune, type Run } from "../src/game/run";
import { checkSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { heroesFor } from "../src/net/rulesGate";
import { maxGoldByDay, validateUpload, type Validation } from "../src/net/validate";
import { isReachable } from "../src/net/records";
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { driveRuns } from "./uploadDriver";

const Z: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
/** Every hero the game offers (hero select's list): the heroes bb-0.9.7's rules accept (the first test checks they agree). */
const HEROS: readonly HeroId[] = PLAYABLE_HEROES;
const PLATE = ITEMS.plating.supply!.hull!, PLATE_GOLD = ITEMS.plating.price; // an ARMOR PACK: +250 max hull, 5 gold
const CRATE = ITEMS.beltcrate.supply!.belt!, CRATE_GOLD = ITEMS.beltcrate.price; // a BELT PACK: +4 belt, 2 gold
const D = 5; // the LAST CHANCE day of a scripted LAST CHANCE run: five dusk losses (the day-3 refund between) leave 1 life

afterEach(() => { // the shipped values (AZ-BUMP's flip; were false); every test sets its switches itself (every())
  setNpcDay(true);
  setHullScale(true);
  setLadderFix(true);
});
/** Every switch on (or off), each through its setter. */
const every = (on = true): void => {
  setNpcDay(on);
  setHullScale(on);
  setLadderFix(on);
};

// ------------------------------------------------------------------ POST /v1/ghosts's checks (server/app.ts, in its order)

/** Step 4, the strict decoder (a throw is the endpoint's 400): the snapshot as the client sends it, JSON text. */
const decode = (s: unknown): GhostSnapshot => checkSnapshot(JSON.parse(JSON.stringify(s)));
/** Step 6, the deck (422 "deck failed validation" with these errors): validateUpload with the snapshot's run seed, its LAST
 *  CHANCE and its road log, exactly as the endpoint calls it. */
const deck = (s: GhostSnapshot): Validation => validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}), ...(s.road ? { road: s.road } : {}) });
/** Step 6, the record (422 "record: ..."): reachable with the snapshot's LAST CHANCE day, or none. */
const record = (s: GhostSnapshot): boolean => isReachable(s.day, s.wins, s.lives, { lastChance: s.lastChance?.day ?? null });

/** `s` with `plates` more ARMOR PACKs, `crates` more BELT PACKs and `hull` more max hull (all in day-1 units). */
const supplied = (s: GhostSnapshot, plates: number, crates = 0, hull = 0): GhostSnapshot => ({
  ...s, build: { ...s.build, hullBonus: s.build.hullBonus + plates * PLATE + hull, beltCap: s.build.beltCap + crates * CRATE },
});
/** The most whole ARMOR PACKs the check takes on top of `s` (the deck at its budget's edge). */
function edge(s: GhostSnapshot): number {
  let k = 0;
  while (k < 400 && deck(supplied(s, k + 1)).ok) k++;
  return k;
}

/** The player mode's budget line (roadCap.ts playerSupplyBudget), read back. */
const BUDGET = /^budget: build costs (\d+) gold \(items \d+, mods \d+, \d+ crates, \d+ plating(?:, turrets \d+)?(?:, road [^)]+)?\) but a player's day (\d+) allows at most (\d+) \(maxGoldByDay (\d+) \+ roadCap (-?\d+)(?: \+ rune gold (\d+))?(?: \+ free part (\d+))?(?: \+ drops (\d+))?\)$/;
function budget(e: string | undefined): { cost: number; day: number; allow: number; shop: number; cap: number; freePart: number; drops: number } {
  const m = BUDGET.exec(e ?? "");
  if (!m) throw new Error(`not a budget line: ${e}`);
  return { cost: +m[1], day: +m[2], allow: +m[3], shop: +m[4], cap: +m[5], freePart: +(m[7] ?? 0), drops: +(m[8] ?? 0) };
}

/** `t` gold as whole ARMOR PACKs and BELT PACKs (5a + 2b = t, the most packs of ARMOR), or null (t = 1 or 3). */
function packs(t: number): [plates: number, crates: number] | null {
  for (let p = Math.floor(t / PLATE_GOLD); p >= 0; p--) if ((t - p * PLATE_GOLD) % CRATE_GOLD === 0) return [p, (t - p * PLATE_GOLD) / CRATE_GOLD];
  return null;
}

// ------------------------------------------------------------------ scripted honest runs through the game's rules

interface Tally {
  packs: number; // ARMOR PACKs bought
  hullRunes: string[]; // HULL runes taken at a dawn
  lcPart?: { id: string; stars: number; placed: boolean }; // the PART card's copy, its star and whether REFIT placed it
  drops: Record<Difficulty, number>; // wins that dropped a part, by tier
  hardStar2: number; // Hard drops whose cargo copy came at ★2 (or merged above)
  matriarch: number; // the Matriarch's legendary part
  roadHull: string[]; // the road's hull choices taken ("dock PLATING +200")
}
interface Dusk {
  s: GhostSnapshot;
  grant: number; // the flat max-hull grants so far, day-1 units: ARMOR PACKs, HULL runes, LAST CHANCE's HULL card, the road's
}
interface Played {
  hero: HeroId;
  seed: number;
  dusks: Dusk[];
  run: Run;
  tally: Tally;
}

const copies = (run: Run, def: string) => [...run.inventory, ...run.build.items, ...run.build.mods, ...turretList(run.build)].filter((c) => c.def === def);

/** REFIT: each cargo copy goes onto the deck where the build screen lets it (a rig or factory on the first free cell,
 *  canPlaceItem; gear on a turret with a free gear slot, canFitGear; a turret in an empty slot; a core in an empty socket);
 *  moving never fuses, and gainModule kept the fuse invariant, so no pair forms. */
function placeCargo(run: Run): void {
  for (const it of [...run.inventory]) {
    const b = run.build, d = ITEMS[it.def];
    if (d.kind === "gate" || d.kind === "factory") {
      let at: [number, number] | null = null;
      for (let y = 0; y < GRID && !at; y++) for (let x = 0; x < GRID && !at; x++) if (canPlaceItem(b, it.def, x, y).ok) at = [x, y];
      if (!at) continue;
      const got = takeFromInventory(run, it.uid)!;
      placeItem(b, { uid: got.uid, def: got.def, x: at[0], y: at[1], ...starField(starsOf(got)), ...rotField(got.def, 0) });
    } else if (d.kind === "mod") {
      const t = hullSlots(b.hero).map((_, i) => i).find((i) => canFitGear(b, i, it.def).ok);
      if (t === undefined) continue;
      const got = takeFromInventory(run, it.uid)!;
      b.mods.push({ uid: got.uid, def: got.def, turret: t, ...starField(starsOf(got)) });
    } else if (d.kind === "turret") {
      const free = turretSlots(b).find((s) => !s.turret);
      if (free) installFromCargo(run, it.uid, free.slot);
    } else if (d.kind === "core") {
      const t = turretSlots(b).find((s) => s.turret && !b.mods.some((m) => m.turret === s.slot && ITEMS[m.def].kind === "core"));
      if (t) fitCore(run, it.uid, t.slot);
    }
  }
}

interface Script {
  card?: Boon; // lose dusks 1-D so LAST CHANCE fires at dusk D; this card at dawn D + 1 (absent: every dusk won)
  armor?: boolean; // every dawn, ARMOR PACKs while the purse pays (spent down to the edge of the shop's gold)
  hullRune?: boolean; // a HULL rune whenever the dawn offers one (else the offer's first)
  tier?: (d: number) => Difficulty; // the fork's tier (default: Easy, Medium, Hard in turn; the Matriarch holds Hard's slot from day 8)
  days?: number;
}

/** One honest run with every switch on, through the game's rules: each dawn a pending LAST CHANCE first, the rune pick, the
 *  caravan's ARMOR PACKs; the fork's tier, a won fight (its drop), the day's event (its first open choice), REFIT (cargo
 *  onto the deck); snapshotted at each dusk (day.ts ghostOf), then the dusk lost (days 1-D of a LAST CHANCE run) or won. */
function play(hero: HeroId, seed: number, o: Script = {}): Played {
  every();
  const days = o.days ?? 10, tier = o.tier ?? ((d: number) => DIFFICULTIES[(d - 1) % 3]);
  const run = newRun(hero, seed, `hull1d-${hero}-${seed}-${o.card ?? "won"}${o.armor ? "-armor" : ""}`);
  const t: Tally = { packs: 0, hullRunes: [], drops: { easy: 0, medium: 0, hard: 0 }, hardStar2: 0, matriarch: 0, roadHull: [] };
  const dusks: Dusk[] = [];
  let grant = run.build.hullBonus; // the starting deck's own (0)
  for (let d = 1; d <= days; d++) {
    const lc = pendingLastChance(run);
    if (lc) {
      const h0 = run.build.hullBonus;
      expect(takeLastChance(run, o.card!).ok, `${hero} #${seed} LAST CHANCE ${o.card}`).toBe(true);
      if (o.card === "hull") expect(run.build.hullBonus - h0).toBe(LAST_CHANCE_HULL); // +500 in day-1 units, never x M
      if (o.card === "part") {
        expect(lc.partStars).toBe(LAST_CHANCE_PART_STARS); // the card offers its part at ★2 with HULL_SCALE on
        t.lcPart = { id: lc.part!, stars: Math.max(...copies(run, lc.part!).map(starsOf)), placed: false };
      }
      grant += run.build.hullBonus - h0;
    }
    const offer = pendingRune(run);
    if (offer) {
      const hull = o.hullRune ? offer.ids.find((id) => RUNES[id].kind === "hull") : undefined;
      const h0 = run.build.hullBonus;
      expect(takeRune(run, hull ?? offer.ids[0]).ok).toBe(true);
      if (hull) {
        t.hullRunes.push(hull);
        expect(run.build.hullBonus - h0).toBe(RUNES[hull].amount.n); // a HULL rune's amount in day-1 units
      }
      grant += run.build.hullBonus - h0;
    }
    if (o.armor) {
      while (run.gold >= PLATE_GOLD) {
        expect(buyPack(run, "armor").ok).toBe(true);
        t.packs++;
        grant += PLATE;
      }
    }
    leaveCaravan(run);
    const pick = tier(d);
    expect(pickRoad(run, pick).ok, `${hero} #${seed} d${d} ${pick}`).toBe(true);
    const w = finishWarlord(run, 0, 20)!;
    if (w.took) {
      const last = run.warlords[run.warlords.length - 1];
      if (last.id === "matriarch") t.matriarch++;
      else {
        t.drops[pick]++;
        if (pick === "hard" && copies(run, w.took).some((c) => starsOf(c) >= DROP_STARS.hard)) t.hardStar2++;
      }
    }
    onToTheRoad(run);
    const list = choicesFor(run), ev = run.event?.id;
    const i = list.findIndex((c) => !c.blocked);
    if (i >= 0) {
      const h0 = run.build.hullBonus;
      pickChoice(run, i);
      const dh = run.build.hullBonus - h0;
      if (dh) t.roadHull.push(`${ev} ${list[i].label} ${dh > 0 ? "+" : ""}${dh}`);
      grant += dh;
    }
    onToTheRoad(run); // REFIT
    placeCargo(run);
    leaveCaravan(run);
    if (t.lcPart) t.lcPart.placed = [...run.build.items, ...run.build.mods, ...turretList(run.build)].some((c) => c.def === t.lcPart!.id);
    dusks.push({ s: ghostOf(run, 1_790_000_000_000, "p-hull1d", null), grant });
    if (d < days) finishDay(run, o.card && d <= D ? 1 : 0, 30, { ...Z }, { ...Z });
  }
  return { hero, seed, dusks, run, tally: t };
}

/** The warlord of road entry `e`, re-derived as roadProblem does (the Matriarch beaten on the log's first win over her). */
function warlordOf(road: readonly RoadEntry[], seed: number, e: RoadEntry): RivalId {
  let beaten: number | undefined;
  for (const x of [...road].sort((a, b) => a.day - b.day)) {
    const id = warlordOffer(seed, x.day, beaten)[x.tier];
    if (x === e) return id;
    if (id === "matriarch" && x.outcome === "win") beaten = x.day;
  }
  throw new Error(`day ${e.day} is not in the log`);
}

/** Battle-time max HULL runes (BULKHEADS, SCRAP HALO) add to a battle's max hull past the build's: none held. */
const flatHullOnly = (b: Build): boolean => !(b.runes ?? []).some((q) => RUNES[q.id].kind === "perTurretHull" || RUNES[q.id].kind === "mergedHull");

// the scripted runs, played once (every hero: a run won every dusk with ARMOR PACKs and HULL runes, one won without them,
// and one of each LAST CHANCE card)
const CARDS: readonly (Boon | undefined)[] = [undefined, "rune", "part", "hull"];
let played: Played[] | null = null;
function scripted(): Played[] {
  if (played) return played;
  const out: Played[] = [];
  for (const [h, hero] of HEROS.entries()) {
    for (const seed of [4100 + h, 4200 + h]) {
      out.push(play(hero, seed, { armor: true, hullRune: true }));
      for (const card of CARDS) out.push(play(hero, seed + 50, { card, hullRune: card !== undefined }));
    }
  }
  played = out;
  return out;
}

describe("HULL-1d (g)1: honest uploads pass with every switch on, every hero, days 1-10", () => {
  it("every hero the game offers is a hero bb-0.9.7's rules accept", () => {
    expect([...HEROS].sort()).toEqual([...heroesFor(RULES_VERSION)].sort());
  });

  it("the upload driver's runs: every dusk passes (mixed, each tier, the road's hull and belt events; LAST CHANCE drawn)", () => {
    every();
    expect([npcDayRules(), hullScaleRules(), ladderFixRules()]).toEqual([true, true, true]);
    const seen = new Set<string>(), drops: Record<string, number> = {}, lc: Record<string, number> = {};
    const bad: string[] = [];
    let n = 0;
    for (const policy of ["mixed", "warlord:easy", "warlord:medium", "warlord:hard", "event:dock:PLATING|warlord:hard", "event:storm:RIDE THROUGH|warlord:medium", "event:cache:BELT SPOOL|warlord:easy", "event:sappers:HIRE|warlord:hard"] as const) {
      for (const r of driveRuns(policy === "mixed" ? 24 : 8, 8300, HEROS, policy, "drawn")) {
        if (r.run.lastChance?.boon) lc[r.run.lastChance.boon] = (lc[r.run.lastChance.boon] ?? 0) + 1;
        for (const d of r.dusks) {
          expect(d.roadLog!.length, `${d.hero} d${d.day}`).toBe(d.day);
          const v = validateUpload(d.build, d.day, RULES_VERSION, { seed: d.runSeed, road: d.roadLog, ...(d.lastChance ? { lastChance: d.lastChance } : {}) });
          if (!v.ok) bad.push(`${policy} ${d.hero} #${d.seed} d${d.day} (${d.road}): ${v.errors[0]}`);
          seen.add(`${d.hero}:${d.day}`);
          n++;
        }
        for (const e of r.dusks[r.dusks.length - 1].roadLog!) if (e.drop) drops[e.tier] = (drops[e.tier] ?? 0) + 1;
      }
    }
    console.log(`HULL1D-G driver: ${n} dusks, ${bad.length} refused; drops by tier ${JSON.stringify(drops)}; LAST CHANCE taken ${JSON.stringify(lc)}\n${bad.join("\n")}`);
    expect(bad).toEqual([]);
    for (const h of HEROS) for (let day = 1; day <= 10; day++) expect(seen.has(`${h}:${day}`), `${h} d${day}`).toBe(true);
    for (const tier of DIFFICULTIES) expect(drops[tier] ?? 0, tier).toBeGreaterThan(10);
    expect(n).toBe((24 + 7 * 8) * 10);
  });

  it("scripted runs: each LAST CHANCE card, drops at each tier (Hard's at ★2), ARMOR PACKs and HULL runes; every dusk passes POST's checks", () => {
    const runs = scripted();
    every();
    const cards: Record<string, number> = {}, lines: string[] = [];
    const sum: Tally = { packs: 0, hullRunes: [], drops: { easy: 0, medium: 0, hard: 0 }, hardStar2: 0, matriarch: 0, roadHull: [] };
    let n = 0, battles = 0, lcPartPlaced = 0;
    for (const p of runs) {
      const lc = p.run.lastChance;
      if (lc?.boon) cards[lc.boon] = (cards[lc.boon] ?? 0) + 1;
      sum.packs += p.tally.packs;
      sum.hullRunes.push(...p.tally.hullRunes);
      for (const tier of DIFFICULTIES) sum.drops[tier] += p.tally.drops[tier];
      sum.hardStar2 += p.tally.hardStar2;
      sum.matriarch += p.tally.matriarch;
      sum.roadHull.push(...p.tally.roadHull);
      if (p.tally.lcPart) {
        expect(p.tally.lcPart.stars, `${p.hero} #${p.seed}`).toBeGreaterThanOrEqual(LAST_CHANCE_PART_STARS); // to cargo at ★2
        if (p.tally.lcPart.placed) lcPartPlaced++;
      }
      for (const { s, grant } of p.dusks) {
        const at = `${p.hero} #${p.seed} ${lc?.boon ?? "no LAST CHANCE"} d${s.day}`;
        expect(decode(s), at).toEqual(checkSnapshot(s)); // the decoder takes it (no 400) and keeps every field
        expect(deck(s).errors, at).toEqual([]);
        expect(record(s), `${at}: ${s.wins}W ${s.lives} lives`).toBe(true);
        // every flat grant is in hullBonus, in day-1 units (the snapshot never carries M): packs, HULL runes, LAST CHANCE's
        // HULL card, the road's PLATING and RIDE THROUGH
        expect(s.build.hullBonus, at).toBe(grant);
        // the drops count at their star: Hard's at ★2, Easy's and Medium's at ★1, the Matriarch's legendary part at ★1
        expect(roadDropValue(s.road), at).toBe((s.road ?? []).reduce((v, e) => v + (e.drop ? valueOf(e.drop, dropClass(e.drop) !== null && e.tier === "hard" ? 2 : 1) : 0), 0));
        // and the battle on that day plays M(d) x (base + hullBonus), rounded to a whole 10
        if ([1, 5, 6, 10].includes(s.day) && flatHullOnly(s.build)) {
          const b = new Battle(s.build, s.build, 1, undefined, s.day);
          expect(b.sides[0].hull.max, at).toBe(scaleTenths(HEROES[s.hero].hull + grant, dayMulTenths(s.day)));
          expect(b.sides[0].hull.max).toBe(hullAt(HEROES[s.hero].hull + s.build.hullBonus, s.day));
          battles++;
        }
        n++;
      }
      const last = p.dusks[p.dusks.length - 1].s;
      lines.push(`${p.hero} #${p.seed} ${lc?.boon ?? "won"}${lc?.id ? ` ${lc.id}` : ""}: packs ${p.tally.packs}, hull runes ${p.tally.hullRunes.join("/") || "-"}, road hull ${p.tally.roadHull.join("/") || "-"}, drops e${p.tally.drops.easy} m${p.tally.drops.medium} h${p.tally.drops.hard} (★2 ${p.tally.hardStar2}) q${p.tally.matriarch}; d10 hullBonus ${last.build.hullBonus} -> max hull ${hullAt(HEROES[p.hero].hull + last.build.hullBonus, 10)}`);
    }
    console.log(`HULL1D-G scripted: ${runs.length} runs, ${n} dusks, ${battles} battles checked; cards ${JSON.stringify(cards)}, LAST CHANCE part on the deck in ${lcPartPlaced}\n${lines.join("\n")}`);
    expect(n).toBe(runs.length * 10);
    expect(cards).toEqual({ rune: HEROS.length * 2, part: HEROS.length * 2, hull: HEROS.length * 2 });
    for (const tier of DIFFICULTIES) expect(sum.drops[tier], tier).toBeGreaterThan(8);
    expect(sum.hardStar2).toBe(sum.drops.hard); // every Hard drop went to cargo at ★2
    expect(sum.matriarch).toBeGreaterThan(0);
    expect(sum.packs).toBeGreaterThan(HEROS.length * 2 * 10);
    expect(sum.hullRunes.length).toBeGreaterThan(4);
    expect(lcPartPlaced).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ forgeries

/** A scripted run of `card` (the first by hero order), its dusk `day`. */
function lcDusk(card: Boon, day = D + 1, want: (p: Played) => boolean = () => true): { p: Played; s: GhostSnapshot } {
  const p = scripted().find((x) => x.run.lastChance?.boon === card && want(x))!;
  expect(p, `a ${card} run`).toBeDefined();
  return { p, s: p.dusks[day - 1].s };
}

describe("HULL-1d (g)2: forgeries are refused with every switch on, each with its line", () => {
  it("a second LAST CHANCE: two LAST CHANCE runes; the field as a list (400); the HULL card's +500 twice", () => {
    const { s } = lcDusk("rune");
    every();
    expect(deck(s).ok).toBe(true);
    const runes = s.build.runes!;
    const spare = runeList().find((d) => d.tier === "epic" && runeFits(d, s.hero) && !runes.some((q) => q.id === d.id))!;
    const two = { ...s, build: { ...s.build, runes: [...runes.slice(0, D + 1), { id: spare.id }, ...runes.slice(D + 1)] } };
    expect(deck(two).errors[0]).toMatch(/^rune: runes: \d+ held on day \d+, at most one a dawn and one LAST CHANCE$/);
    expect(() => decode({ ...s, lastChance: [s.lastChance, s.lastChance] })).toThrow(/^snapshot\.lastChance: a run has one LAST CHANCE, not a list of 2$/);
    const h = lcDusk("hull", 10).s;
    const k = edge(h);
    expect(deck(supplied(h, k)).ok).toBe(true);
    const twice = supplied(h, k, 0, LAST_CHANCE_HULL);
    expect(deck(twice).errors[0]).toMatch(/^(budget|supply): /);
  });

  it("a second LAST CHANCE in the record: a second life back after the one on day 5 (4 lives at dusk 9; PATCH UP gives 3 at most)", () => {
    const { s } = lcDusk("hull", 9);
    every();
    expect([s.wins, s.lives, record(s)]).toEqual([3, 2, true]); // lost days 1-5, LAST CHANCE (2 lives), won days 6-8
    expect(record({ ...s, lives: 3 })).toBe(true); // the DOCK's PATCH UP on a later road: 3 is honest
    const forged = { ...s, lives: 4 };
    expect(deck(forged).ok).toBe(true); // the deck is honest ...
    expect(record(forged)).toBe(false); // ... the record is not: one LAST CHANCE gives one life, once a run
  });

  it("a boon without the qualifying loss: a LAST CHANCE on a run that never lost to 1 life (the record refuses it)", () => {
    every();
    const won = scripted().find((p) => !p.run.lastChance && p.dusks[D].s.lives === 5)!;
    const s = won.dusks[D].s; // dusk 6, five wins, 5 lives
    const hull = { ...s, lastChance: { day: D, boon: "hull" as Boon }, build: { ...s.build, hullBonus: s.build.hullBonus + LAST_CHANCE_HULL } };
    expect(deck(hull).ok).toBe(true); // the HULL card is always offered: the deck alone can't tell
    expect(record(hull)).toBe(false);
    // the honest LAST CHANCE run's dusk 6 claiming it fired on day 4 (2 lives left at dusk 4: no loss to 1 life)
    const { s: lc } = lcDusk("hull");
    const early = { ...lc, lastChance: { day: 4, boon: "hull" as Boon } };
    expect(deck(early).ok).toBe(true);
    expect(record(early)).toBe(false);
  });

  it("a part not in the seeded offer; a part that is no LAST CHANCE part", () => {
    const { s } = lcDusk("part");
    every();
    const id = s.lastChance!.id!;
    const other = lastChanceParts().find((d) => d.id !== id)!.id;
    expect(deck({ ...s, lastChance: { ...s.lastChance!, id: other } }).errors[0]).toMatch(new RegExp(`^lastChance: part ${other} was not in the LAST CHANCE offer of day ${D} \\(it offered ${id}\\)$`));
    expect(deck({ ...s, lastChance: { ...s.lastChance!, id: "press" } }).errors[0]).toMatch(/^lastChance: press is no LAST CHANCE part/);
  });

  /** The first PART run whose dusk-10 deck holds the card's copy, at ★2, once (REFIT put it there), and that copy's def. */
  function partOnDeck(): { s: GhostSnapshot; id: string } {
    const onDeck = (s: GhostSnapshot) => [...s.build.items, ...s.build.mods, ...turretList(s.build)].filter((c) => c.def === s.lastChance!.id).map(starsOf);
    const p = scripted().find((x) => x.run.lastChance?.boon === "part" && JSON.stringify(onDeck(x.dusks[9].s)) === JSON.stringify([LAST_CHANCE_PART_STARS]));
    expect(p, "a PART run with its ★2 copy on the deck").toBeDefined();
    const s = p!.dusks[9].s;
    return { s, id: s.lastChance!.id! };
  }
  /** `s` with its copy of `id` at `stars` (a rig, gear or turret). */
  const restar = (s: GhostSnapshot, id: string, stars: number): GhostSnapshot => {
    const b = s.build, set = <T extends { def: string; stars?: number }>(c: T): T => (c.def === id ? { ...c, stars } : c);
    return { ...s, build: { ...b, items: b.items.map(set), mods: b.mods.map(set), ...(b.turrets ? { turrets: b.turrets.map(set) } : {}) } };
  };

  it("the LAST CHANCE part at the wrong stars: the purse at its edge, a ★3 copy (the card's ★2 value counted twice) is refused; two ★2 copies too", () => {
    const { s, id } = partOnDeck();
    every();
    expect(lastChancePartStars()).toBe(2);
    const k = edge(s);
    const full = supplied(s, k);
    expect(deck(full).ok).toBe(true);
    const over = deck(restar(full, id, 3));
    expect(over.errors[0]).toMatch(/^budget: build costs \d+ gold .* \+ free part \d+/);
    expect(budget(over.errors[0]).freePart).toBe(valueOf(id, LAST_CHANCE_PART_STARS)); // the free part is the ★2 copy's value, once
    // the same deck one gold over: the free part counted once (its value at ★2, not at ★3 nor twice)
    const line = budget(deck(supplied(full, 1)).errors[0]);
    expect(line.freePart).toBe(valueOf(id, 2));
    // the card's copy twice: a second ★2 copy beside it (a rig on a free cell, gear on the same turret, a turret in another
    // slot) is an unfused pair
    const b = full.build;
    const twin = ((): Build => {
      const it = b.items.find((c) => c.def === id);
      if (it) {
        for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (canPlaceItem(b, id, x, y).ok) return { ...b, items: [...b.items, { ...it, uid: 9999, x, y }] };
        throw new Error("no free cell");
      }
      const m = b.mods.find((c) => c.def === id);
      if (m) return { ...b, mods: [...b.mods, { ...m, uid: 9999 }] };
      const list = turretList(b), t = list.find((c) => c.def === id)!;
      const slot = turretSlots(b).find((v) => !v.turret)?.slot ?? list.find((c) => c.def !== id)!.slot;
      return { ...b, turrets: [...list.filter((c) => c.slot !== slot), { ...t, uid: 9999, slot }].sort((x, y) => x.slot - y.slot) } as Build;
    })();
    const pair = deck({ ...full, build: twin });
    expect(pair.errors.join(" | ")).toMatch(new RegExp(`item: UNFUSED PAIR: ${ITEMS[id].name.replace(/[.]/g, "\\.")} ★2 x2`));
    console.log(`HULL1D-G ★ lines (${s.hero} seed ${s.seed} ${id}): ★3 at the edge: ${over.errors[0]}\n  two ★2: ${pair.errors.join(" | ")}`);
  });

  // HULL-1d (g), reviewed (cap_beta): with room in the purse a ★3 copy of the PART card's part is HONEST-REACHABLE, not a
  // forgery: the free ★2 copy merges with a bought ★2 (two ★1 buys merged) into a ★3, and the budget counts value, not
  // copies (validate.ts: the free part at valueOf(id, ★2), the rest paid). So the server takes it whenever those 2 x price
  // fit the purse, and refuses it at the purse's edge (the test above). Pinned as accepted, so a change to the rule shows.
  it("the LAST CHANCE part as a ★3 copy with room in the purse passes: the free ★2 plus a bought ★2, merged (value, not copies)", () => {
    const { s, id } = partOnDeck();
    every();
    const r = deck(restar(s, id, 3));
    console.log(`HULL1D-G ★3 with room: ${s.hero} seed ${s.seed} day ${s.day} ${id}: ★3 copy -> ${r.ok ? "accepted" : r.errors[0]}`);
    expect(r.ok).toBe(true);
  });

  it("a hull one step over the ceiling: one ARMOR PACK, one whole 10 (day-1 units) or the day's own number, every hero, days 1, 5 and 10", () => {
    const lines: string[] = [];
    for (const p of scripted().filter((x) => x.tally.packs > 0 || x.run.lastChance?.boon === "hull")) {
      every();
      for (const day of [1, 5, 10]) {
        const s = p.dusks[day - 1].s;
        const k = edge(s);
        expect(deck(supplied(s, k)).errors).toEqual([]);
        const plate = deck(supplied(s, k + 1));
        expect(plate.errors[0]).toMatch(/^budget: build costs \d+ gold .* but a player's day \d+ allows at most \d+/);
        const ten = deck(supplied(s, k, 0, 10));
        // (the line names the bought hull: hullBonus without the HULL runes' and the HULL card's grants)
        expect(ten.errors[0]).toMatch(new RegExp(`^supply: hullBonus \\d+ is not a hull a player can reach by day ${day} \\(\\+250 plating; `));
        // a client that sent the day's hull (M(d) x (base + hullBonus)) as hullBonus: refused from day 2 (M > 1)
        const base = HEROES[s.hero].hull, shown = hullAt(base + s.build.hullBonus + k * PLATE, day) - base;
        const sent = deck({ ...s, build: { ...s.build, hullBonus: shown } });
        if (day > 1) expect(sent.ok, `${p.hero} d${day} sent ${shown}`).toBe(false);
        lines.push(`${p.hero} #${p.seed} ${p.run.lastChance?.boon ?? "packs"} d${day}: hullBonus ${s.build.hullBonus} + ${k} ARMOR PACKs ok (max hull ${hullAt(base + s.build.hullBonus + k * PLATE, day)}); +1 refused: ${plate.errors[0]}`);
      }
    }
    console.log(`HULL1D-G hull edge\n${lines.join("\n")}`);
    expect(lines.length).toBeGreaterThanOrEqual(HEROS.length * 2 * 3);
  });

  it("gold over the new income table: a deck at exactly the day's allowance passes, one gold more is refused (days 8-10, where the tables part)", () => {
    every();
    // HULL-1c's income: 6 + min(day, 10) + 2 a win (hullScale.ts incomeOn), read by content.ts incomeFor, so maxGoldByDay
    const table = Array.from({ length: 10 }, (_, i) => START_GOLD + Array.from({ length: i }, (_, j) => incomeOn(j + 1, true)).reduce((a, b) => a + b, 0));
    expect(table).toEqual([8, 17, 27, 38, 50, 63, 77, 92, 108, 125]);
    for (let d = 1; d <= 10; d++) {
      expect(incomeFor(d, true)).toBe(6 + Math.min(d, 10) + 2);
      expect(maxGoldByDay(d)).toBe(table[d - 1]);
    }
    setHullScale(false); // 0.9.7's table parts from it on day 8
    expect([7, 8, 9, 10].map(maxGoldByDay)).toEqual([77, 91, 105, 119]);
    setHullScale(true);
    const lines: string[] = [];
    for (const p of scripted().filter((x) => !x.tally.packs && !x.run.lastChance)) {
      for (const day of [8, 9, 10]) {
        const s = p.dusks[day - 1].s;
        // a probe far over (200 ARMOR PACKs) names the allowance; whole packs leave the deck's best mix as it was
        const probe = budget(deck(supplied(s, 200)).errors[0]);
        const room = probe.allow - (probe.cost - 200 * PLATE_GOLD);
        expect(room, `${p.hero} d${day}`).toBeGreaterThanOrEqual(4);
        const at = supplied(s, ...packs(room)!), over = supplied(s, ...packs(room + 1)!);
        expect(deck(at).errors, `${p.hero} d${day} at the allowance`).toEqual([]);
        const line = budget(deck(over).errors[0]);
        expect(line.cost).toBe(line.allow + 1); // one gold over
        expect(line.allow).toBe(probe.allow);
        expect(line.shop).toBe(table[day - 1]); // the new table (0.9.7's would say 91, 105, 119)
        lines.push(`${p.hero} #${p.seed} d${day}: ${probe.allow} allowed (maxGoldByDay ${line.shop} + roadCap ${line.cap} + drops ${line.drops}), ${line.cost} refused`);
      }
    }
    console.log(`HULL1D-G gold\n${lines.join("\n")}`);
    expect(lines.length).toBe(HEROS.length * 2 * 3);
  });

  it("a drop not from that NPC's loadout, and a drop that is not the seeded roll, at each tier", () => {
    every();
    const lines: string[] = [];
    for (const tier of DIFFICULTIES) {
      let done = false;
      for (const p of scripted()) {
        if (done) break;
        const s = p.dusks[9].s;
        for (const [i, e] of s.road!.entries()) {
          if (e.tier !== tier || e.outcome !== "win" || !e.drop) continue;
          const id = warlordOf(s.road!, s.seed!, e);
          if (id === "matriarch") continue;
          const own = warlordDeck(id, e.day, !!e.sabotaged);
          expect(warlordDrop(s.seed!, e.day, id, e.tier, own)).toBe(e.drop);
          const other = dropPool(own).find((x) => x !== e.drop);
          if (!other) continue;
          const at = (x: Partial<RoadEntry> | null): GhostSnapshot => ({ ...s, road: s.road!.map((y, j) => (j !== i ? y : x === null ? (({ drop: _, ...rest }) => rest)(y) : { ...y, ...x })) });
          const name = RIVALS[id].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const roll = deck(at({ drop: other }));
          expect(roll.errors[0]).toMatch(new RegExp(`^road: day ${e.day}: the seeded roll of ${name} gave ${e.drop}, not ${other}$`));
          const none = deck(at(null));
          expect(none.errors[0]).toMatch(new RegExp(`^road: day ${e.day}: the seeded roll of ${name} gave ${e.drop}, not no drop$`));
          const outside = Object.keys(ITEMS).find((x) => ITEMS[x].kind === "gate" && ITEMS[x].rarity === "common" && !dropPool(own).includes(x) && !dropPool(warlordDeck(id, e.day, !e.sabotaged)).includes(x))!;
          const pool = deck(at({ drop: outside }));
          expect(pool.errors[0]).toMatch(new RegExp(`^road: day ${e.day}: ${outside} is not in ${name}'s pool$`));
          lines.push(`${tier} (${p.hero} #${p.seed} day ${e.day}, ${id}, rolled ${e.drop}${tier === "hard" ? " at ★2" : ""}):\n  ${roll.errors[0]}\n  ${none.errors[0]}\n  ${pool.errors[0]}`);
          done = true;
          break;
        }
      }
      expect(done, tier).toBe(true);
    }
    console.log(`HULL1D-G drops\n${lines.join("\n")}`);
  });

  it("a second event on one day: the road log names no event (400); a second fight that day; a deck whose hull needs two events by day 1", () => {
    // a run whose deck took no hull by day 2 (no pack, no HULL rune, no road hull)
    const p = scripted().find((x) => x.dusks[0].s.build.hullBonus === 0 && x.dusks[1].s.build.hullBonus === 0)!;
    every();
    const s1 = p.dusks[0].s, s2 = p.dusks[1].s;
    // the road log carries the day's fight only (day, tier, outcome, drop, sabotaged): an event in it is an unknown field
    expect(() => decode({ ...s1, road: [{ ...s1.road![0], event: "dock" }] })).toThrow(/^snapshot\.road\[0\]\.event: unknown field$/);
    // a second entry for a day (a second fight)
    expect(deck({ ...s2, road: [...s2.road!, { ...s2.road![1] }] }).errors).toEqual(["road: two entries for day 2"]);
    // the events show only in the deck's road mix: +100 off the plating grid is the dock's PLATING (+200) AND the storm's
    // RIDE THROUGH (-100), two events: not by day 1 (one fight, then one event); by day 2 they fit the road's stops.
    // AZ-PREP (REVIEW-HULL1D Q1): and, with NPC_DAY on, only where the seed offered both by then (eventFor(seed, 1..2)); on
    // any other seed the seed's line (was: accepted on any seed, the mix seed-blind)
    const one = deck(supplied(s1, 0, 0, 100));
    expect(one.errors[0]).toMatch(/^supply: hullBonus 100 is not a hull a player can reach by day 1 \(\+250 plating; (?=.*dock PLATING \+200)(?=.*storm RIDE THROUGH -100).*, once a run each\)$/);
    const road2 = [eventFor(s2.seed!, 1), eventFor(s2.seed!, 2)], two = deck(supplied(s2, 0, 0, 100));
    if (road2.includes("dock") && road2.includes("storm")) expect(two.errors).toEqual([]);
    else expect(two.errors).toEqual([expect.stringMatching(new RegExp(`^supply: hullBonus 100 needs (?=.*dock PLATING)(?=.*storm RIDE THROUGH).*, which this run's seed did not offer by day 2 \\(its road: ${[...new Set(road2)].join(", ")}\\)$`))]);
    console.log(`HULL1D-G second event: ${p.hero} #${p.seed} day 1 +100 hull: ${one.errors[0]}`);
  });

  // AZ-PREP (REQ-BFG-078; REVIEW-HULL1D Q1, BRIEF-AZPREP section 3): HULL-1d (g)'s FINDING (an it.fails here until now), ruled
  // in behind NPC_DAY. roadCap's model is seed-blind (any run seed: the whole bag), so a day-1 deck could claim the dock's
  // PLATING (+200 hull) though the seed's day-1 event was another one. With NPC_DAY on, where the snapshot carries its seed
  // and every day's event is eventFor(seed, d) after its fight, validate.ts now holds the deck's road mix to the seed's events
  // by its day (roadCap.ts playerFits `offered`). Off, or without a seed: seed-blind, as before.
  it("a day-1 deck with the dock's PLATING when the seed's day-1 event is not the dock is refused; an honest dock day passes; off, the mix is seed-blind as before", () => {
    const p = scripted().find((x) => x.dusks[0].s.build.hullBonus === 0 && eventFor(x.run.seed, 1) !== "dock" && !x.dusks[0].s.road![0].drop)!;
    every();
    const s = p.dusks[0].s, forged = supplied(s, 0, 0, 200);
    expect(deck(s).ok).toBe(true);
    const r = deck(forged);
    expect(r.errors).toEqual([`supply: hullBonus 200 needs dock PLATING, which this run's seed did not offer by day 1 (its road: ${eventFor(s.seed!, 1)})`]);
    // an honest dock day: a seed whose day-1 event is the dock; the run takes its PLATING (+200) after the fight and passes
    const seed = Array.from({ length: 400 }, (_, i) => 4400 + i).find((x) => eventFor(x, 1) === "dock")!;
    const q = play(p.hero, seed, { days: 1 });
    expect(q.tally.roadHull).toEqual(["dock PLATING +200"]);
    const honest = deck(q.dusks[0].s);
    expect(honest.errors).toEqual([]);
    // off: no seed check, the mix is seed-blind as before (no supply line for the same +200 deck; its road log left out, as a
    // switch-off snapshot carries none)
    every(false);
    const off = validateUpload(forged.build, 1, forged.rules, { seed: forged.seed });
    expect(off.errors.filter((e) => e.startsWith("supply:"))).toEqual([]);
    console.log(`AZPREP road mix: ${p.hero} seed ${s.seed} day-1 event ${eventFor(s.seed!, 1)}; +200 hull (dock PLATING) -> ${r.errors[0]}; dock seed ${seed}: ${q.tally.roadHull.join("/")} -> ${honest.ok ? "accepted" : honest.errors[0]}; switch off: ${off.errors.filter((e) => e.startsWith("supply:")).length} supply lines`);
  });
});

describe("HULL-1d (g)2: through POST /v1/ghosts with every switch on", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-hull1d-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("201 for each LAST CHANCE card's run; 422 with its line for a boon without its loss, a second LAST CHANCE, a forged drop and a hull over the ceiling; 400 for two", async () => {
    const me = await testIdentity(0);
    const post = async (s: GhostSnapshot, runId: string): Promise<{ status: number; text: string }> => {
      const body = JSON.stringify(ownedBy({ ...s, runId }, me));
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      return { status: r.status, text: JSON.stringify(await r.json()) };
    };
    const runs = scripted();
    every();
    for (const card of ["rune", "part", "hull"] as Boon[]) {
      const { s } = lcDusk(card, 10);
      const r = await post(s, `hull1d-${card}`);
      expect(r.status, `${card}: ${r.text}`).toBe(201);
    }
    const won = runs.find((p) => !p.run.lastChance && p.dusks[D].s.lives === 5)!.dusks[D].s;
    expect((await post(won, "hull1d-won")).status).toBe(201);
    expect(app.store.size).toBe(4);
    // a boon without the qualifying loss: the record line
    const boon = await post({ ...won, lastChance: { day: D, boon: "hull" }, build: { ...won.build, hullBonus: won.build.hullBonus + LAST_CHANCE_HULL } }, "hull1d-boon");
    expect(boon.status).toBe(422);
    expect(boon.text).toMatch(/record: 5W 5 lives is no record a run carries into dusk 6 after a LAST CHANCE on day 5/);
    // a second LAST CHANCE's life: 4 lives at dusk 9 after one on day 5
    const nine = lcDusk("hull", 9).s;
    const second = await post({ ...nine, lives: 4 }, "hull1d-second");
    expect(second.status).toBe(422);
    expect(second.text).toMatch(/record: 3W 4 lives is no record a run carries into dusk 9 after a LAST CHANCE on day 5/);
    // the field as a list of two: the decoder's 400
    const list = await post({ ...nine, lastChance: [nine.lastChance, nine.lastChance] } as unknown as GhostSnapshot, "hull1d-list");
    expect(list.status).toBe(400);
    expect(list.text).toMatch(/snapshot\.lastChance: a run has one LAST CHANCE, not a list of 2/);
    // a part not in the seeded offer: the deck's 422
    const part = lcDusk("part", 10).s;
    const other = lastChanceParts().find((d) => d.id !== part.lastChance!.id)!.id;
    const offer = await post({ ...part, lastChance: { ...part.lastChance!, id: other } }, "hull1d-offer");
    expect(offer.status).toBe(422);
    expect(offer.text).toMatch(new RegExp(`lastChance: part ${other} was not in the LAST CHANCE offer of day 5`));
    // a drop the seeded roll didn't give
    const s = runs.find((p) => !p.run.lastChance)!.dusks[9].s;
    const pool = (e: RoadEntry) => dropPool(warlordDeck(warlordOf(s.road!, s.seed!, e), e.day, !!e.sabotaged));
    const i = s.road!.findIndex((e) => e.drop && warlordOf(s.road!, s.seed!, e) !== "matriarch" && pool(e).length > 1);
    const e = s.road![i], swap = pool(e).find((x) => x !== e.drop)!;
    const drop = await post({ ...s, road: s.road!.map((x, j) => (j === i ? { ...x, drop: swap } : x)) }, "hull1d-drop");
    expect(drop.status).toBe(422);
    expect(drop.text).toMatch(new RegExp(`road: day ${e.day}: the seeded roll of .+ gave ${e.drop}, not ${swap}`));
    // a hull one ARMOR PACK over the ceiling
    const k = edge(s);
    const hull = await post(supplied(s, k + 1), "hull1d-hull");
    expect(hull.status).toBe(422);
    expect(hull.text).toMatch(/budget: build costs \d+ gold .* but a player's day 10 allows at most \d+/);
    expect((await post(supplied(s, k), "hull1d-edge")).status).toBe(201);
    expect(app.store.size).toBe(5);
    console.log(`HULL1D-G server: ${[boon, second, list, offer, drop, hull].map((x) => `${x.status} ${x.text}`).join("\n")}`);
  });
});
