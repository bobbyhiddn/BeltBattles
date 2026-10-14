// 0.6.2 BELTSIDE (ref/DESIGN-beltside.md D1-D3): migrateInlineGates at every load boundary, `rot` in saves,
// snapshots and stand-in codes, and the validator's D2 checks. The corpus test runs every deck that was
// valid before the pivot through the migration: the inline preset decks frozen from 8167743
// (fixtures/beltside-062/inline-presets.json), the golden-060 decks, and the whole stand-in pool as its codes
// are written. Set BB_MIGRATION_REPORT=<file> to write the per-source counts as JSON.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { loadGhostPool, migrateV1 } from "../src/net/fallback";
import { arrowCell, arrowsOf, cloneBuild, key as K, kx, ky, rotField, type Build, type Placed } from "../src/sim/deck";
import {
  clearMigrationLog, migrateDeck, migrateInlineGates, migrationLog, neighbourOrder, rotFacing,
} from "../src/sim/beltside";
import { buildCost, maxGoldByDay, validateBuild, validateUpload } from "../src/net/validate"; // S8 run 3: + validateUpload (the player mode)
import { npcDayRules } from "../src/sim/npcDay"; // S8 run 3: the budget line is left to the player mode only while NPC_DAY is on
import { checkSnapshot, decodeSnapshot, encodeSnapshot, SnapshotError } from "../src/net/snapshot";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { exceptPairs } from "./harnessLegacy";
// S8 run 3: + standInPool and StandInEntry (a pool deck's road log, StandInEntry.road)
import { decodeStandIn, decodeStarredRaw, encodeStandIn, standInPool, type StandInEntry } from "../src/sim/standInPool";
import { migrateRun, newRun, type Run } from "../src/game/run";
import { BELTSIDE_TOAST, MIGRATE_CARGO_CAP } from "../src/game/save";
import { isSnapshot, migrateSnapshot, type GhostSnapshot } from "../src/game/ghostSnapshot";
import { ghostOf } from "../src/game/day";
import { valueOf } from "../src/sim/stars";

const J = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
function furnace(items: Placed[] = [], cells = SHORT): Build {
  return { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells }], mods: [], beltCap: 30, hullBonus: 0 };
}
/** Gates standing ON belt tiles (the pre-BELTSIDE placement). */
const inlineOf = (b: Build): Placed[] => {
  const belt = new Set(b.routes.flatMap((r) => r.cells));
  return b.items.filter((p) => ITEMS[p.def]?.kind === "gate" && belt.has(K(p.x, p.y)));
};

describe("D3: migrateInlineGates", () => {
  it("neighbour order: left of travel, right of travel, then the others by direction index", () => {
    const b = furnace();
    expect(neighbourOrder(b, 0, 2)).toEqual([3, 1, 0, 2]); // travel up (0): left = -x (3), right = +x (1)
    const west = furnace([], [K(4, 5), K(3, 5), K(2, 5)]);
    expect(neighbourOrder(west, 0, 1)).toEqual([2, 0, 1, 3]); // travel -x (3): left = back (2), right = forward (0)
    expect(neighbourOrder(west, 0, 0)).toEqual([3, 1, 0, 2]); // tile 0: travel is out of the Kiln (up)
  });

  it("moves a gate left of travel and turns its first arrow to face its old tile, for every shape", () => {
    for (const [def, rot] of [["temper", 1], ["longhaul", 0], ["coil", 1], ["splitter", 1], ["overdrive", 0]] as [string, number][]) {
      const b = furnace([{ uid: 2, def, x: 4, y: 3 }]);
      const m = migrateInlineGates(b);
      const p = b.items[1];
      expect([m.moved.length, m.stranded.length, p.x, p.y, p.rot ?? 0], def).toEqual([1, 0, 3, 3, rot]);
      expect(rotFacing(def, 1), def).toBe(rot);
      expect(m.moved[0]).toEqual({ uid: 2, def, from: K(4, 3), to: K(3, 3), rot });
      const faces = arrowsOf(p).map((d) => arrowCell(p.x, p.y, d));
      if (def === "overdrive") expect(faces).toContain(K(4, 3)); // X ignores rotation and faces every side
      else expect(faces[0], def).toBe(K(4, 3));
      expect(validateBuild(b, 10).errors, def).toEqual([]);
    }
  });

  it("right of travel when the left is taken; then the others by direction index; stranded when none is free", () => {
    const right = furnace([{ uid: 2, def: "temper", x: 4, y: 3 }, { uid: 3, def: "coil", x: 3, y: 3 }]);
    migrateInlineGates(right);
    expect([right.items[1].x, right.items[1].y, right.items[1].rot]).toEqual([5, 3, 3]);
    // a corner: the belt turns +x at (4,4), so right of travel is the next tile; the left is taken, so the
    // gate goes forward (direction 0) to (4,3) and faces back (2)
    const corner = furnace([{ uid: 2, def: "whetstone", x: 4, y: 4 }, { uid: 3, def: "coil", x: 3, y: 4 }],
      [K(4, 5), K(4, 4), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)]);
    migrateInlineGates(corner);
    expect([corner.items[1].x, corner.items[1].y, corner.items[1].rot]).toEqual([4, 3, 2]);
    const boxed = furnace([{ uid: 2, def: "whetstone", x: 4, y: 4 }, { uid: 3, def: "coil", x: 3, y: 4 }, { uid: 4, def: "brake", x: 5, y: 4 }]);
    const m = migrateInlineGates(boxed);
    expect(m.moved).toEqual([]);
    expect(m.stranded.map((p) => p.uid)).toEqual([2]);
    expect(boxed.items.map((p) => p.uid)).toEqual([1, 3, 4]);
  });

  it("gates move in deck order: an earlier gate can take the cell a later one wanted", () => {
    // tiles 2 and 3 of a belt that turns: (4,3) wants (3,3); (3,2)... both deterministic
    const b = furnace([{ uid: 2, def: "temper", x: 4, y: 2 }, { uid: 3, def: "whetstone", x: 3, y: 1 }],
      [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(3, 2), K(3, 1), K(3, 0)]);
    const a = J(b);
    migrateInlineGates(b);
    migrateInlineGates(a);
    expect(b).toEqual(a);
    expect(inlineOf(b)).toEqual([]);
  });

  it("is deterministic and idempotent, and leaves a native deck exactly as it is", () => {
    const b = furnace([{ uid: 2, def: "splitter", x: 4, y: 3 }, { uid: 3, def: "whetstone", x: 4, y: 1, stars: 2 }]);
    const x = J(b), y = J(b);
    migrateInlineGates(x);
    migrateInlineGates(y);
    expect(x).toEqual(y);
    const again = J(x);
    expect(migrateInlineGates(again)).toEqual({ moved: [], stranded: [] });
    expect(again).toEqual(x);
    expect(x.items[2].stars).toBe(2); // stars ride along
  });
});

describe("D3: stranded rigs at each load boundary", () => {
  const boxedRun = (inventory: number): Run => {
    const run = newRun("furnace", 42, "me");
    run.build = furnace([{ uid: 200, def: "whetstone", x: 4, y: 4, stars: 2 }, { uid: 201, def: "coil", x: 3, y: 4 }, { uid: 202, def: "brake", x: 5, y: 4 }]);
    run.inventory = Array.from({ length: inventory }, (_, i) => ({ uid: 300 + i, def: "temper" }));
    return J(run);
  };

  it("a save: the stranded rig goes to cargo with its stars, or is refunded at its value when cargo is full", () => {
    clearMigrationLog();
    const a = migrateRun(boxedRun(0))!;
    expect(a.build.items.map((p) => p.uid)).toEqual([1, 201, 202]);
    expect(a.inventory).toEqual([{ uid: 200, def: "whetstone", stars: 2 }]);
    expect(a.fuseFx).toContain(BELTSIDE_TOAST);
    const full = boxedRun(MIGRATE_CARGO_CAP);
    const gold = full.gold;
    const b = migrateRun(full)!;
    expect(b.inventory).toHaveLength(MIGRATE_CARGO_CAP);
    expect(b.gold).toBe(gold + valueOf("whetstone", 2));
    expect(migrationLog().stats.find((s) => s.source === "save")).toMatchObject({ decks: 2, moved: 0, cargoed: 1, refunded: 1, dropped: 0 });
  });

  it("a save migrates once: a migrated run reloads unchanged, with no second toast", () => {
    const run = newRun("furnace", 7, "me");
    run.build = furnace([{ uid: 200, def: "temper", x: 4, y: 3 }]);
    const once = migrateRun(J(run))!;
    expect([once.build.items[1].x, once.build.items[1].rot]).toEqual([3, 1]);
    const twice = migrateRun(J({ ...once, fuseFx: [] }))!;
    expect(twice.build).toEqual(once.build);
    expect(twice.fuseFx).toEqual([]);
  });

  it("a stored dusk foe and a ghost drop their stranded rig and log it; a preset build does too", () => {
    clearMigrationLog();
    const run = boxedRun(0);
    run.dusk = { day: 1, kind: "standin", name: "X", hero: "furnace", build: furnace([{ uid: 5, def: "whetstone", x: 4, y: 4 }, { uid: 6, def: "coil", x: 3, y: 4 }, { uid: 7, def: "brake", x: 5, y: 4 }]) };
    const r = migrateRun(J(run))!;
    expect(r.dusk!.build.items.map((p) => p.uid)).toEqual([1, 6, 7]);
    const g: GhostSnapshot = {
      v: 1, rules: "bb-0.4.0", hero: "furnace", day: 2, wins: 1, lives: 3, runId: "r1", playerId: "p1", createdAt: 0,
      build: furnace([{ uid: 5, def: "whetstone", x: 4, y: 4 }, { uid: 6, def: "coil", x: 3, y: 4 }, { uid: 7, def: "brake", x: 5, y: 4 }, { uid: 8, def: "temper", x: 4, y: 2 }]),
    };
    const out = migrateSnapshot(J(g), "me")!;
    expect(out.build.items.map((p) => p.uid)).toEqual([1, 6, 7, 8]);
    expect(out.v).toBe(2); // the moved TEMPER carries rot, which only v2 allows
    expect(isSnapshot(out)).toBe(true);
    expect(() => checkSnapshot(out)).not.toThrow();
    const p = migrateDeck(furnace([{ uid: 5, def: "whetstone", x: 4, y: 4 }, { uid: 6, def: "coil", x: 3, y: 4 }, { uid: 7, def: "brake", x: 5, y: 4 }]), "preset:test");
    expect(p.items.map((q) => q.uid)).toEqual([1, 6, 7]);
    const log = migrationLog();
    expect(log.stats.find((s) => s.source === "save:dusk")).toMatchObject({ dropped: 1 });
    expect(log.stats.find((s) => s.source === "ghost")).toMatchObject({ moved: 1, dropped: 1 });
    expect(log.stats.find((s) => s.source === "preset:test")).toMatchObject({ dropped: 1 });
    expect(log.drops.filter((d) => d.includes("WHETSTONE"))).toHaveLength(3);
  });

  it("a v1 snapshot decoded from the network (the bundled pool, a server answer) migrates before it is validated", () => {
    clearMigrationLog();
    const g = {
      v: 1, rules: RULES_VERSION, hero: "furnace", day: 3, wins: 1, lives: 3, runId: "r1", playerId: "p1", createdAt: 0,
      build: furnace([{ uid: 5, def: "temper", x: 4, y: 3 }]),
    };
    expect(validateBuild(g.build as Build, 3).ok).toBe(false); // as written: a gate on a belt tile
    const load = loadGhostPool([J(g)]);
    // S8 T1a (REQ-BFG-092; cause a48010b): the loader checks an entry in the player mode, the seed step's rule (was the strict
    // mode), whose rune count wants one rune a dawn; runes travel only in v3, so a v1 entry (rune-less) is refused on that
    // count alone, after its migration: its only line is the count, not the unmigrated gate's placement. The migrated deck
    // is read from migrateV1, the loader's first step (was the loaded entry)
    expect(load.rejected).toEqual([{ index: 0, error: "rune: runes: 0 held on day 3, one a dawn (3)" }]);
    expect(migrationLog().stats.find((x) => x.source === "ghost:net")).toMatchObject({ decks: 1, moved: 1, dropped: 0 });
    const s = migrateV1(checkSnapshot(J(g)), "ghost:s8-t1a");
    expect([s.v, s.build.items[1].x, s.build.items[1].y, s.build.items[1].rot]).toEqual([2, 3, 3, 1]);
    expect(validateBuild(s.build, 3).ok).toBe(true);
    // v2 (and a v1 with nothing on a belt) passes unchanged
    const native = checkSnapshot({ ...J(g), v: 2, build: furnace([{ uid: 5, def: "temper", x: 3, y: 3, rot: 1 }]) });
    expect(migrateV1(native)).toBe(native);
    const clean = checkSnapshot({ ...J(g), build: furnace() });
    expect(migrateV1(clean)).toEqual(clean);
  });
});

// ---------------------------------------------------------------- the corpus

interface Rec { source: string; key: string; hero: HeroId; day: number; deck: Build; road?: StandInEntry["road"] }
const here = (f: string) => fileURLToPath(new URL(f, import.meta.url));
const presets = (JSON.parse(readFileSync(here("./fixtures/beltside-062/inline-presets.json"), "utf8")) as { decks: Rec[] }).decks;
const golden = ["rivals", "par", "standins", "starts"].flatMap((f) =>
  (JSON.parse(readFileSync(here(`./fixtures/golden-060/${f}.json`), "utf8")) as { entries: Rec[] }).entries.map((e) => ({ ...e, source: "golden-060" })));
const pool: Rec[] = (Object.keys(STAND_IN_DATA.pools) as HeroId[]).flatMap((hero) =>
  // beltside-062-on-061 (P15): pool v2 carries stars, so its decks are read as generated with the star-aware raw decode
  // S8 run 3: + its road log (the tuple's seventh element, StandInEntry.road; standInPool's entries in the tuples' order)
  STAND_IN_DATA.pools[hero]!.flatMap((d, i) => d[1].map((t, j) => ({ source: "standin", key: `standin/${hero}/${i + 1}/${j}`, hero, day: i + 1, deck: decodeStarredRaw(hero, t[3]), road: standInPool(hero, i + 1)[j]!.road }))));

/** A PvE deck (a road warlord's hull ramp is no whole plating and may be negative): judged as a deck on day 10 with no plating. */
const pve = (r: Rec) => /^(ai\/warlord|rival\/warlord|rival\/)/.test(r.key);
const judged = (r: Rec, b: Build): [Build, number] => (pve(r) ? [{ ...b, hullBonus: 0 }, 10] : [b, r.day]);

/** The pre-BELTSIDE validator: today's, with gates allowed to stand on belt tiles (and paid for). */
function legacyErrors(b: Build, day: number): string[] {
  const inline = new Set(inlineOf(b));
  const errs = validateBuild({ ...cloneBuild(b), items: b.items.filter((p) => !inline.has(p)) }, day).errors.filter((e) => !e.startsWith("budget:"));
  if (buildCost(b).total > maxGoldByDay(day)) errs.push(`budget: ${buildCost(b).total} > ${maxGoldByDay(day)}`);
  return errs;
}

/** S8 run 3 (RULING-S8-R5 section 3 item 1, T1e's form (RULING-S8-R1 item 3); cause a48010b: with NPC_DAY on, a road-fed
 *  deck spends the road's drops too, by design): the stand-in pool was regenerated once with every switch on (P1 83c039d),
 *  so a deck may hold the road's gold and drops, which the budget line (the shop's gold alone) doesn't count; its drops count
 *  through its road log (StandInEntry.road), in the player mode. So a stand-in deck is held to its lines minus at most its
 *  ONE budget line (matched by its "budget: " prefix, and only while NPC_DAY is on: off, the lines stay whole) AND to
 *  validateUpload in the player mode with its road log (a stand-in carries no run seed); one that fails the player mode keeps
 *  every line. Was: the lines whole (standin: 0 of 120 valid, each on its one budget line alone, furnace d1 #0 "budget:
 *  11 > 8"; all 120 pass the player mode). Other sources: unchanged. */
function lessBudget(r: Rec, b: Build, day: number, errs: string[]): string[] {
  const budget = r.source === "standin" && npcDayRules() ? errs.filter((e) => e.startsWith("budget: ")) : [];
  if (budget.length !== 1) return errs;
  return validateUpload(b, day, RULES_VERSION, r.road ? { road: r.road } : {}).errors.length ? errs : errs.filter((e) => e !== budget[0]);
}

interface Row { source: string; decks: number; validBefore: number; validAfter: number; migrated: number; rigs: number; moved: number; cargoed: number; refunded: number; dropped: number; valueDropped: number }

describe("D3 over every deck that was valid before the pivot", () => {
  const rows: Row[] = [];
  const all = [...presets, ...golden, ...pool];
  for (const source of [...new Set(all.map((r) => r.source))]) {
    it(`${source}: every valid deck migrates to a deck that passes validateBuild; rigs keep their old tile`, () => {
      const row: Row = { source, decks: 0, validBefore: 0, validAfter: 0, migrated: 0, rigs: 0, moved: 0, cargoed: 0, refunded: 0, dropped: 0, valueDropped: 0 };
      const bad: string[] = [];
      // beltside-062-on-061 (the 0.6.1 flip, FUSE_LIVE): validateBuild now rejects an unmerged same-star pair. The
      // preset and golden decks hold such pairs until job E merges them (nothing in the game validates them), so, as
      // the flip checks the par decks (tests/harnessLegacy.ts exceptPairs), they meet every rule but the pair rule.
      // The stand-in pool (v2, merge-aware: no unmerged pair) meets every rule.
      const rules = (errs: string[]): string[] => (source === "standin" ? errs : exceptPairs(errs));
      for (const r of all.filter((x) => x.source === source)) {
        row.decks++;
        const before = J(r.deck);
        row.rigs += before.items.filter((p) => ITEMS[p.def].kind === "gate").length;
        const [jb, day] = judged(r, before);
        const wasValid = rules(lessBudget(r, jb, day, legacyErrors(jb, day))).length === 0; // S8 run 3: lessBudget (T1e's form)
        const after = J(r.deck);
        const m = migrateInlineGates(after);
        const again = J(r.deck);
        migrateInlineGates(again);
        if (JSON.stringify(again) !== JSON.stringify(after)) bad.push(`${r.key}: not deterministic`);
        if (migrateInlineGates(J(after)).moved.length) bad.push(`${r.key}: not idempotent`);
        if (m.moved.length || m.stranded.length) row.migrated++;
        row.moved += m.moved.length;
        row.dropped += m.stranded.length;
        row.valueDropped += m.stranded.reduce((n, p) => n + valueOf(p.def), 0);
        if (inlineOf(after).length) bad.push(`${r.key}: a rig still stands on a belt tile`);
        for (const mv of m.moved) {
          const p = after.items.find((q) => q.uid === mv.uid)!;
          const faces = arrowsOf(p).map((d) => arrowCell(p.x, p.y, d));
          const next = Math.abs(kx(mv.from) - p.x) + Math.abs(ky(mv.from) - p.y) === 1;
          if (!next || !faces.includes(mv.from) || (ITEMS[p.def].id !== "overdrive" && faces[0] !== mv.from)) bad.push(`${r.key}: uid ${mv.uid} lost its tile`);
        }
        if (!wasValid) continue;
        row.validBefore++;
        const [ja, dayA] = judged(r, after);
        const errs = rules(lessBudget(r, ja, dayA, validateBuild(ja, dayA).errors)); // S8 run 3: lessBudget (T1e's form)
        if (!errs.length) row.validAfter++;
        else bad.push(`${r.key}: ${errs[0]}`);
      }
      // the same decks as a player's save (cargo empty) put their stranded rigs in cargo, then refund them
      if (source === "standin" || source === "preset:hero") {
        for (const r of all.filter((x) => x.source === source)) {
          const run = newRun(r.hero === "weaver" ? "weaver" : "furnace", 3, "me");
          run.hero = r.hero;
          run.build = J(r.deck);
          run.inventory = [];
          const stranded = migrateInlineGates(J(r.deck)).stranded, gold = run.gold;
          const back = migrateRun(J(run))!;
          const cargo = back.inventory.length, refunds = stranded.slice(cargo);
          if (cargo !== Math.min(stranded.length, MIGRATE_CARGO_CAP)) bad.push(`${r.key}: ${cargo} in cargo of ${stranded.length} stranded`);
          if (back.gold !== gold + refunds.reduce((n, p) => n + valueOf(p.def, p.stars ?? 1), 0)) bad.push(`${r.key}: refund ${back.gold - gold}`);
          row.cargoed += cargo;
          row.refunded += refunds.length;
        }
      }
      rows.push(row);
      expect(bad).toEqual([]);
      expect(row.validAfter).toBe(row.validBefore);
      expect(row.validBefore, `${source}: the corpus holds valid decks`).toBeGreaterThan(0);
    });
  }

  it("reports moved, cargoed and dropped counts per source", () => {
    const lines = ["source          decks valid→ok  migrated  rigs  moved  dropped (gold)  save: cargoed refunded"];
    for (const r of rows) {
      lines.push(`${r.source.padEnd(15)} ${String(r.decks).padStart(5)} ${String(r.validBefore).padStart(5)}→${String(r.validAfter).padEnd(4)} ${String(r.migrated).padStart(8)} ${String(r.rigs).padStart(5)} ${String(r.moved).padStart(6)} ${String(r.dropped).padStart(8)} (${r.valueDropped})  ${String(r.cargoed).padStart(13)} ${String(r.refunded).padStart(8)}`);
    }
    console.log(lines.join("\n"));
    if (process.env.BB_MIGRATION_REPORT) writeFileSync(process.env.BB_MIGRATION_REPORT, JSON.stringify(rows, null, 1) + "\n");
    expect(rows.length).toBe(6);
  });
});

describe("D1: rot round trips", () => {
  it("a save keeps a rig's rot (and never writes one for rotation 0)", () => {
    const run = newRun("furnace", 9, "me");
    run.build.items.push({ uid: 150, def: "longhaul", x: 3, y: 3, ...rotField("longhaul", 3) }, { uid: 151, def: "temper", x: 5, y: 3, ...rotField("temper", 0) });
    const back = migrateRun(J(run))!;
    expect(back.build.items.find((p) => p.uid === 150)!.rot).toBe(3);
    expect("rot" in back.build.items.find((p) => p.uid === 151)!).toBe(false);
    expect(back.fuseFx ?? []).not.toContain(BELTSIDE_TOAST);
  });

  it("GhostSnapshot v2 carries rot through ghostOf, the local pool check and the wire format; v1 refuses it", () => {
    const run = newRun("furnace", 9, "me");
    run.build.items.push({ uid: 150, def: "splitter", x: 3, y: 3, rot: 1 }, { uid: 151, def: "coil", x: 5, y: 3, rot: 2, stars: 2 });
    const g = ghostOf(run, 1_790_000_000_000, "p-me");
    expect(g.v).toBe(3); // RUNES-1 (snapshot v3): ghostOf carries the run seed; rot rides from v2 on
    expect(isSnapshot(g)).toBe(true);
    const back = decodeSnapshot(encodeSnapshot(g));
    expect(back.build.items.map((p) => p.rot)).toEqual([undefined, 1, 2]);
    expect(back).toEqual(g);
    const { seed: _seed, ...g2 } = g; // RUNES-1: without the v3 seed, so rot is what v1 refuses
    expect(isSnapshot({ ...g2, v: 1 })).toBe(false);
    expect(isSnapshot({ ...g2, v: 2 })).toBe(true);
    expect(() => checkSnapshot({ ...g2, v: 1 })).toThrow(/rot: not allowed in a v1 snapshot/);
    expect(() => checkSnapshot(J({ ...g, build: { ...g.build, mods: [{ uid: 9, def: "chamber", turret: 0, rot: 1 }] } }))).toThrow(SnapshotError);
  });

  it("stand-in codes carry rot as r1-r3 and round-trip; only a rig may carry one", () => {
    const b = furnace([{ uid: 2, def: "splitter", x: 3, y: 3, rot: 1 }, { uid: 3, def: "overdrive", x: 5, y: 2 }]);
    const code = encodeStandIn(b);
    expect(code).toBe("30 0/kiln64 splitter33r1 overdrive25/1:544434241404/");
    expect(decodeStandIn("furnace", code)).toEqual(b);
    expect(() => decodeStandIn("furnace", "14 0/kiln64r1/1:544434241404/")).toThrow(/not a rig/);
    expect(() => decodeStandIn("furnace", "14 0/kiln64 temper33r4/1:544434241404/")).toThrow(/bad item/);
  });
});

describe("D2: validateBuild", () => {
  const day = 10;
  const errs = (b: Build) => validateBuild(J(b), day).errors;
  it("rejects machinery on a belt tile", () => {
    expect(errs(furnace([{ uid: 2, def: "temper", x: 4, y: 3 }]))).toEqual(["placement: uid 2 TEMPER at 4,3: BELT IN THE WAY"]);
    expect(errs(furnace([{ uid: 2, def: "press", x: 4, y: 2 }]))[0]).toMatch(/^placement: uid 2 STAMP PRESS at 4,2: BELT IN THE WAY/);
    expect(errs(furnace([{ uid: 2, def: "temper", x: 3, y: 3, rot: 1 }]))).toEqual([]);
  });
  it("rejects rot outside 0-3 and rot on anything that is not a rig; an X rig may carry one", () => {
    for (const rot of [4, -1, 1.5]) expect(errs(furnace([{ uid: 2, def: "temper", x: 3, y: 3, rot }]))[0], `rot ${rot}`).toMatch(/^shape: build\.items\[1\]\.rot: expected an integer in 0\.\.3/);
    expect(errs({ ...furnace(), items: [{ uid: 1, def: "kiln", x: 4, y: 6, rot: 1 }] })).toEqual(["item: uid 1 KILN can't have a rot (only rigs turn)"]);
    expect(errs(furnace([{ uid: 2, def: "overdrive", x: 3, y: 3, rot: 2 }]))).toEqual([]);
    const mod = { ...furnace(), mods: [{ uid: 5, def: "chamber", turret: 0, rot: 1 }] } as unknown as Build;
    expect(errs(mod)[0]).toMatch(/^shape: build\.mods\[0\]\.rot: unknown field/);
  });
});
