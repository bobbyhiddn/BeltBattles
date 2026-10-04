import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GRID, HEROES, ITEMS, RULES_VERSION, RUN_DAYS, buyableModules, type Rarity } from "../src/sim/content";
import {
  hullSlots, key, kx, ky, occupancy, startingTurrets, turretList, turretSellValue, turretValue, turretsCost,
  type Build, type BuildTurret,
} from "../src/sim/deck";
import { FUSE_MAX } from "../src/sim/stars";
import { MATRIARCH_DAY, warlordPool, DIFFICULTIES } from "../src/sim/rivals";
import { EVENTS, EVENT_IDS, UPGRADE, salvagePool, smugglerPool, tradeGood, type EventState } from "../src/game/eventDefs";
import { ROAD_PICKS, warlordDeck, warlordDeckDay, warlordReward } from "../src/game/road";
import { newRun, storeTurret } from "../src/game/run";
import { gainModule } from "../src/game/fuse";
import { MODELLED_EVENTS, MODELLED_PICKS, playerFits, roadOptions } from "../src/net/roadCap";
import { buildCost, maxHonestSpend, validateBuild, validateUpload } from "../src/net/validate";
import { fetchGhost, submitGhost, type GhostRequest } from "../src/net/ghostClient";
import type { GhostSnapshot } from "../src/net/snapshot";
import { floorRecord } from "../src/net/records";
import { createGhostServer, type GhostServer } from "../server/app";
import { furnaceDeck, playerCheck } from "./netHelpers";
import { heroesFor } from "../src/net/rulesGate";
import { driveRuns, type Dusk } from "./uploadDriver";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

// v070-validate-062m (M5, brief 0c): the player mode on the 0.6.2 mechanics head 7bcde98 (turret slots REQ-BFG-031,
// belt joins REQ-BFG-027, the REQ-BFG-033 offer mix). Recheck 1: the player mode costs turrets exactly as the strict
// mode's buildCost does: bought copies at their value, a free starting copy at 0 (turretValue), only installed ones.

const FREE = startingTurrets("furnace"); // slot 0: the free SCRAP CANNON; slot 1 (columns 9-10) is the empty extra slot

/** The FURNACE starting deck with this turret list, plates and crates (its belt feeds slot 0's intake). */
function turreted(turrets: BuildTurret[], plates = 0, crates = 0): Build {
  // NUM-1: a plate is ITEMS.plating's +250 hull (was a literal 25)
  return { ...furnaceDeck({ hullBonus: ITEMS.plating.supply!.hull! * plates, beltCap: HEROES.furnace.belt + 4 * crates }), turrets };
}

/** Turret layouts and what the strict mode's buildCost says they cost. */
const LAYOUTS: [string, BuildTurret[], number][] = [
  ["the starting layout, written out (free copy: 0)", [...FREE], 0],
  ["an epic HAIL GUN bought into the extra slot", [...FREE, { slot: 1, def: "hailgun", uid: 60 }], ITEMS.hailgun.price],
  ["the free SCRAP CANNON merged with a bought copy (2 stars, free)", [{ ...FREE[0], stars: 2 }], ITEMS.scrapcannon.price],
  ["the free copy at 3 stars (three bought copies inside)", [{ ...FREE[0], stars: 3 }], 3 * ITEMS.scrapcannon.price],
  ["the free copy swapped out for a bought 2-star TWIN NEEDLE; THUNDERER in the extra slot",
    [{ slot: 0, def: "twinneedle", uid: 61, stars: 2 }, { slot: 1, def: "thunderer", uid: 62 }], 2 * ITEMS.twinneedle.price + ITEMS.thunderer.price],
];

describe("062m recheck 1: turrets in the player budget", () => {
  it("buildCost counts installed turrets with the S7 values (the strict mode's cost)", () => {
    for (const [what, list, value] of LAYOUTS) {
      const b = turreted(list);
      expect(turretsCost(b), what).toBe(value);
      expect(buildCost(b).total - buildCost(furnaceDeck()).total, what).toBe(value);
    }
  });

  it("the player mode costs every turret layout exactly as buildCost does, on every day", () => {
    for (const [what, list] of LAYOUTS) {
      for (let plates = 0; plates <= 12; plates += 3) {
        const b = turreted(list, plates, 1);
        const cost = buildCost(b);
        for (let d = 1; d <= RUN_DAYS; d++) {
          const plain = playerFits(b, d, cost).fits.find((f) => f.mix.key === "")!;
          expect(plain.cost, `${what}, ${plates} plates, day ${d}`).toBe(cost.total);
          expect(validateUpload(b, d).ok, `${what}, ${plates} plates, day ${d}`).toBe(cost.total <= maxHonestSpend(d));
        }
      }
    }
  });

  it("a deck one gold over the player ceiling because of its turrets is refused on budget, naming the turrets", () => {
    // v070-rel: day 1 allows 13 on 40d2b2c (was 15 with HAIL GUN 10 + a plate): TWIN NEEDLE (8) + a plate (5) passes;
    // with three crates instead of the plate it is one gold over
    const at = turreted([...FREE, { slot: 1, def: "twinneedle", uid: 60 }], 1, 0);
    expect(buildCost(at).total).toBe(maxHonestSpend(1));
    expect(validateUpload(at, 1)).toEqual({ ok: true, errors: [] });
    const one = turreted([...FREE, { slot: 1, def: "twinneedle", uid: 60 }], 0, 3); // 8 + 3 crates: 14, one gold over
    const over = turreted([{ slot: 0, def: "twinneedle", uid: 61 }, { slot: 1, def: "thunderer", uid: 62 }], 0, 1); // 8 + 13 + 2
    for (const [b, turrets, crates] of [[one, 8, 3], [over, 21, 1]] as const) {
      expect(buildCost(b).total).toBe(turrets + 2 * crates);
      const e = validateUpload(b, 1).errors;
      expect(e).toHaveLength(1);
      expect(e[0]).toBe(`budget: build costs ${turrets + 2 * crates} gold (items 0, mods 0, ${crates} crates, 0 plating, turrets ${turrets}) but a player's day 1 allows at most 13 (maxGoldByDay 8 + roadCap 5)`);
      expect(validateBuild(b, 1).errors.some((x) => x.startsWith("budget:"))).toBe(true);
    }
  });
});

// ------------------------------------------------------------------ honest decks with turrets and joins

/** Honest dusk decks from the seeded driver (tests/uploadDriver.ts plays the real game functions) that hold a bought
 *  turret and a joined belt, all six heroes. */
const HONEST: Dusk[] = driveRuns(90, 7000).flatMap((r) => r.dusks)
  .filter((d) => (d.build.turrets ?? []).some((t) => !t.free) && d.build.routes.some((x) => x.join !== undefined));
/** 0.8.0 H1: the honest decks this server's rules (bb-0.6.2) accept: FURNACE's and WEAVER's (rulesGate.ts RULES_HEROES). */
const HONEST_HERE: Dusk[] = HONEST.filter((d) => heroesFor(RULES_VERSION).includes(d.hero));

const clone = (b: Build): Build => JSON.parse(JSON.stringify(b)) as Build;
const core = (errors: string[]) => errors.filter((e) => !/^(supply|budget):/.test(e));
const around = (k: number): number[] => [[0, -1], [1, 0], [0, 1], [-1, 0]]
  .map(([dx, dy]) => [kx(k) + dx, ky(k) + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < GRID && y < GRID).map(([x, y]) => key(x, y));

/** The player mode reports exactly the strict mode's errors outside supply and budget, and `want` is among them.
 *  0.8.0 H1: each deck through the upload check of rules that accept its hero (netHelpers.ts playerCheck). */
function passesThrough(b: Build, day: number, want: RegExp, what: string): void {
  const s = core(validateBuild(b, day).errors), p = core(playerCheck(b, day).errors);
  expect(p, what).toEqual(s);
  expect(s.some((e) => want.test(e)), `${what}: ${s.join(" | ")}`).toBe(true);
  expect(playerCheck(b, day).ok, what).toBe(false);
}

/** Each of validateBuild's 0.6.2s turret rejections, made from an honest deck. */
function turretCases(b: Build): [string, Build, RegExp][] {
  const slots = hullSlots(b.hero), list = turretList(b);
  const free = slots.findIndex((_, i) => !list.some((t) => t.slot === i));
  const e = free >= 0 ? free : slots.length - 1; // a slot to (re)fill
  const rest = list.filter((t) => t.slot !== e);
  const starts = startingTurrets(b.hero);
  const turrets = buyableModules().filter((d) => d.kind === "turret").map((d) => d.id);
  const notStart = turrets.find((id) => !starts.some((s) => s.def === id))!;
  // turret defs the deck holds no copy of and the hero doesn't start with (a twin would add an unfused pair first)
  const fresh = turrets.filter((id) => !list.some((t) => t.def === id) && !starts.some((s) => s.def === id));
  const epic = fresh.find((id) => ITEMS[id].rarity === "epic")!, common = fresh.find((id) => ITEMS[id].rarity === "common")!;
  // gear and a core the deck holds no copy of (another copy could make an unfused pair, an earlier error)
  const gear = buyableModules().filter((d) => d.kind === "mod" && !b.mods.some((m) => m.def === d.id)).map((d) => d.id);
  const aCore = buyableModules().find((d) => d.kind === "core" && !b.mods.some((m) => m.def === d.id))!.id;
  const other = rest[0]; // an installed turret in another slot
  const out: [string, Build, RegExp][] = [];
  const add = (what: string, t: BuildTurret[], want: RegExp, mods?: (b: Build) => Build["mods"]) => {
    const c = clone(b);
    c.turrets = t;
    if (mods) c.mods = mods(c);
    out.push([what, c, want]);
  };
  add("a slot out of range", [...list, { slot: slots.length, def: epic, uid: 7001 }], /^turret: uid 7001 is in slot \d+; .* turret slots$/);
  add("not a turret", [...rest, { slot: e, def: "temper", uid: 7001 }], /^turret: uid 7001 TEMPER is not a turret$/);
  add("two turrets in one slot", [...list, { ...list[0], uid: 7001 }], /^turret: slot \d+ holds more than one turret$/);
  add("a uid used twice", [...rest, { slot: e, def: epic, uid: b.items[0].uid }], /^turret: uid \d+ is used twice$/);
  add("a free copy the hero doesn't start with", [...rest, { slot: e, def: notStart, uid: 7001, free: true }], /^turret: uid 7001 .* is a free copy, but .* doesn't start with one$/);
  // every slot a free copy of a starting def: a hull always has one slot more than its starting copies
  add("more free copies than the hero starts with", slots.map((_, i) => ({ slot: i, def: starts[0].def, uid: 7001 + i, free: true })), /^turret: \d+ free .* copies, but .* starts with \d+$/);
  add("two bought copies at one star level (unfused)", [...rest.filter((t) => t !== other), { slot: other.slot, def: epic, uid: 7002 }, { slot: e, def: epic, uid: 7001 }],
    /^item: UNFUSED PAIR: .* ★1 x2$/);
  add("gear on an empty slot", rest, /^hardpoint: uid 7003 targets turret \d+; .* is on an empty turret slot \d+$/, (c) => [...c.mods.filter((m) => m.turret !== e), { uid: 7003, def: gear[0], turret: e }]);
  add("a core on an empty slot", rest, /^hardpoint: uid 7003 targets turret \d+; .* is on an empty turret slot \d+$/, (c) => [...c.mods.filter((m) => m.turret !== e), { uid: 7003, def: aCore, turret: e }]);
  add("more gear than the turret's gear slots", [...rest, { slot: e, def: common, uid: 7001 }], /^hardpoint: turret \d+ carries more than one module$/,
    (c) => [...c.mods.filter((m) => m.turret !== e), { uid: 7003, def: gear[0], turret: e }, { uid: 7004, def: gear[1], turret: e }]);
  add("two copies of one gear on a turret", [...rest, { slot: e, def: epic, uid: 7001 }], /^hardpoint: turret \d+ carries two /,
    (c) => [...c.mods.filter((m) => m.turret !== e), { uid: 7003, def: gear[0], turret: e }, { uid: 7004, def: gear[0], turret: e, stars: 2 }]);
  add("stars outside 1..3", [...rest, { slot: e, def: epic, uid: 7001, stars: FUSE_MAX + 1 }], /^(shape|turret): /);
  return out;
}

/** Each join rejection validateBuild reports (deck.ts JOIN_*), made from an honest deck's joined belt. */
function joinCases(b: Build): [string, Build, RegExp][] {
  const occ = occupancy(b);
  const i = b.routes.findIndex((r) => r.join !== undefined);
  const cells = b.routes[i].cells, last = cells[cells.length - 1];
  const out: [string, Build, RegExp][] = [];
  const add = (what: string, k: number | undefined, want: RegExp) => {
    if (k === undefined) return;
    const c = clone(b);
    c.routes[i].join = k;
    out.push([what, c, want]);
  };
  add("a join onto a tile that is no belt", around(last).find((k) => occ[k].route < 0), /^route: route \d+ can't join cell \d+: NOT A BELT TILE$/);
  add("a join onto a belt tile not next to its end", b.routes.flatMap((r, j) => (j === i ? [] : r.cells)).find((k) => !around(last).includes(k)),
    /^route: route \d+ can't join cell \d+: NOT NEXT TO ITS JOIN TILE$/);
  add("a join onto its own tile", cells.length > 1 ? cells[cells.length - 2] : undefined, /^route: route \d+ can't join cell \d+: CAN'T JOIN ITSELF$/);
  return out;
}

describe("062m recheck 2: the superset property with validateBuild's turret and join rejections", () => {
  it("honest decks with bought turrets and joined belts: the player mode accepts every one", () => {
    const by = new Map<string, number>();
    for (const d of HONEST) by.set(d.hero, (by.get(d.hero) ?? 0) + 1);
    console.log(`062m: ${HONEST.length} honest dusk decks with a bought turret and a joined belt (driver seeds 7000-7089): ${[...by].map(([h, n]) => `${h} ${n}`).join(", ")}`);
    expect(HONEST.length).toBeGreaterThan(30);
    expect(new Set(HONEST.map((d) => d.hero)).size).toBeGreaterThanOrEqual(4);
    for (const d of HONEST) {
      expect(playerCheck(d.build, d.day), `${d.hero} #${d.seed} d${d.day}`).toEqual({ ok: true, errors: [] }); // 0.8.0 H1: rules by hero
      expect(core(validateBuild(d.build, d.day).errors), `${d.hero} #${d.seed} d${d.day}`).toEqual([]); // strict: supply/budget at most
    }
  });

  it("every turret rejection reaches the player mode unchanged (deck, hero and day of an honest upload)", () => {
    let n = 0;
    for (const d of HONEST.slice(0, 24)) {
      for (const [what, b, want] of turretCases(d.build)) {
        passesThrough(b, d.day, want, `${d.hero} #${d.seed} d${d.day}: ${what}`);
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(24 * 12);
  });

  it("every join rejection reaches the player mode unchanged", () => {
    const seen = new Set<string>();
    for (const d of HONEST) {
      for (const [what, b, want] of joinCases(d.build)) {
        passesThrough(b, d.day, want, `${d.hero} #${d.seed} d${d.day}: ${what}`);
        seen.add(what);
      }
    }
    expect([...seen].sort()).toEqual(["a join onto a belt tile not next to its end", "a join onto a tile that is no belt", "a join onto its own tile"]);
  });
});

// ------------------------------------------------------------------ recheck 3: the D4 guard and the new acquisition paths

describe("062m recheck 3: the D4 guard on 7bcde98", () => {
  it("the road content is still the reviewed model (no new event, Delta kind, fork pick or reward field since 3fbd553)", () => {
    expect([...EVENT_IDS].sort()).toEqual(Object.keys(MODELLED_EVENTS).sort());
    expect([...ROAD_PICKS]).toEqual([...MODELLED_PICKS]);
    expect(() => roadOptions()).not.toThrow();
  });

  it("turrets never reach a deck from the road: no event choice gains or gives one, no warlord offers one, the trader takes none", () => {
    const isTurret = (id: string) => ITEMS[id]?.kind === "turret";
    for (const pool of [salvagePool(), smugglerPool("BURN"), smugglerPool("SHOCK"), ...(["common", "rare", "epic", "legendary"] as Rarity[]).map((r) => UPGRADE[r])]) {
      expect(pool.filter(isTurret)).toEqual([]);
    }
    // runs holding a turret: the free starting copy stored in cargo, a bought one in cargo, a bought one installed
    const stored = newRun("furnace", 11);
    storeTurret(stored, 0);
    const bought = newRun("weaver", 11);
    gainModule(bought, "hailgun");
    const runs = [stored, bought, ...buyableModules().filter((d) => d.kind === "turret").map((d) => {
      const r = newRun("furnace", 12);
      gainModule(r, d.id);
      return r;
    })];
    expect(stored.inventory.some((i) => i.def === "scrapcannon" && i.free)).toBe(true);
    for (const run of runs) {
      expect(tradeGood(run)?.def && isTurret(tradeGood(run)!.def)).toBeFalsy();
      for (const e of EVENT_IDS) {
        for (let j = 0; j < 32; j++) {
          const ev: EventState = { day: 1, id: e, roll: 0, pick: (j + 0.5) / 32, picked: -1 };
          for (const c of EVENTS[e].choices(run, ev)) {
            for (const x of [...c.cost, ...c.gain]) if (x.k === "item") expect(isTurret(x.def), `${e} ${c.label} ${x.def}`).toBe(false);
          }
        }
      }
    }
    for (let d = 1; d <= RUN_DAYS; d++) {
      for (const t of DIFFICULTIES) {
        for (const id of [...warlordPool(t), ...(t === "hard" && d >= MATRIARCH_DAY ? ["matriarch" as const] : [])]) {
          for (const s of [false, true]) {
            for (const p of warlordReward(id, t, warlordDeck(id, d, s), warlordDeckDay(id, d, s)).parts) expect(isTurret(p), `${id} d${d}`).toBe(false);
          }
        }
      }
    }
  });

  it("the new turret paths are shop-side and refund at most half: a sale pays <= value / 2, a free starting copy is worth 0 and never sells", () => {
    for (const d of buyableModules().filter((x) => x.kind === "turret")) {
      for (let stars = 1; stars <= FUSE_MAX; stars++) {
        for (const free of [false, true]) {
          const c = { def: d.id, stars, free };
          expect(turretValue(c)).toBe(d.price * (2 ** (stars - 1) - (free ? 1 : 0)));
          if (free && stars === 1) expect(turretSellValue(c)).toBe(0);
          else expect(turretSellValue(c)).toBe(Math.floor(turretValue(c) / 2));
        }
      }
    }
  });
});

// ------------------------------------------------------------------ recheck 6: the ghost and upload paths

let dir: string;
let app: GhostServer;
let base: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "bb-v070-062m-"));
  app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const snapOf = (d: Dusk, over: Partial<GhostSnapshot> = {}): GhostSnapshot => ({
  v: 2, rules: RULES_VERSION, hero: d.hero, day: d.day, wins: 0, lives: 3, build: d.build, runId: `drv-${d.seed}`, playerId: `p${d.seed}-${d.day}`,
  createdAt: 1_790_000_000_000, ...over,
});

describe("062m recheck 6: POST /v1/ghosts and a served ghost, with turrets and joins", () => {
  it("POST /v1/ghosts stores honest decks with turrets and joins, and refuses illegal ones with validateBuild's reasons", async () => {
    const me = await testIdentity(0); // v070a: uploads are signed (async-062); each snapshot under the key's playerId
    expect(HONEST_HERE.length).toBeGreaterThanOrEqual(16);
    const honest = HONEST_HERE.slice(0, 16);
    // 0.8.0 H2 (a): 3 lives, or the fewest a run carries into that dusk where 3 is out of reach (days 2 and 3: 4)
    for (const d of honest) expect(await submitGhost(base, ownedBy(snapOf(d, { lives: Math.max(3, floorRecord(d.day).lives) }), me), me, 3000), `${d.hero} #${d.seed} d${d.day}`).toMatchObject({ ok: true });
    expect(app.store.size).toBe(honest.length);
    const d = honest[0];
    const post = async (s: GhostSnapshot) => {
      const body = JSON.stringify(ownedBy(s, me));
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      return { status: r.status, body: (await r.json()) as { error?: string; errors?: string[] } };
    };
    for (const [what, b, want] of [...turretCases(d.build).slice(0, 4), ...joinCases(d.build)]) {
      const r = await post(snapOf(d, { build: b }));
      expect(r.status, what).toBe(422);
      expect(r.body.errors, what).toEqual(validateUpload(b, d.day).errors); // the player mode's errors, verbatim
      expect(r.body.errors!.some((e) => want.test(e)), `${what}: ${r.body.errors!.join(" | ")}`).toBe(true);
    }
    // other rules (v070-rel: rel-062-final is bb-0.6.2, so the older bb-0.6.1). This deck's turrets and joins are refused
    // first, by the decoder's rules gate (M2 b, tests/net-upload.rulesgate.test.ts); a deck with neither meets the exact
    // RULES_VERSION check, string equality with the server's own
    const older = await post(snapOf(d, { rules: "bb-0.6.1" }));
    expect(older.status).toBe(400);
    expect(older.body.error).toMatch(/^snapshot\.rules: rules bb-0\.6\.1 predate bb-0\.6\.2: turret slots \(build\.turrets\) and belt joins /);
    const plain = await post(snapOf(d, { rules: "bb-0.6.1", hero: "furnace", build: furnaceDeck() }));
    expect(plain.status).toBe(422);
    expect(plain.body.error).toBe(`rules bb-0.6.1 not accepted: this server validates ${RULES_VERSION}`);
    expect(RULES_VERSION).toBe("bb-0.8.7");
  });

  it("fetchGhost fights a served ghost with turrets and joins; it falls back on an illegal one and on other rules", async () => {
    const d = HONEST_HERE[0];
    const [what, bad] = turretCases(d.build)[0];
    // the stub server answers by the request's wins: 0 the honest ghost, 1 an illegal turret, 2 another rules version
    // (v070-rel: the older bb-0.6.1, now that RULES_VERSION is bb-0.6.2)
    const srv = createServer((q, s) => {
      s.setHeader("content-type", "application/json");
      const u = q.url ?? "";
      const ghost = u.includes("wins=1") ? snapOf(d, { build: bad }) : u.includes("wins=2") ? snapOf(d, { rules: "bb-0.6.1" }) : snapOf(d);
      s.end(JSON.stringify({ id: "g062m", snapshot: ghost }));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const a = srv.address();
    const url = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
    const req = (wins: number): GhostRequest => ({ rules: RULES_VERSION, day: d.day, wins, lives: 3, playerId: "me", seen: [], hero: "furnace", seed: 7 });
    try {
      const ok = await fetchGhost(url, req(0), 2000);
      expect(ok).toMatchObject({ source: "server", id: "g062m" });
      expect(ok.snapshot.build.turrets).toEqual(d.build.turrets);
      expect(ok.snapshot.build.routes.some((x) => x.join !== undefined)).toBe(true);
      const off = await fetchGhost(url, req(1), 2000);
      expect(off.source, what).toBe("fallback");
      expect(off.error).toBe(`ghost deck invalid: ${validateUpload(bad, d.day).errors[0]}`);
      expect(off.error).toMatch(/^ghost deck invalid: turret: /);
      const other = await fetchGhost(url, req(2), 2000);
      expect(other.source).toBe("fallback");
      // v070-rel M2 (b): its turrets and joins under bb-0.6.1 are refused by the decoder's rules gate, before the rules match
      expect(other.error).toMatch(/^bad snapshot: snapshot\.rules: rules bb-0\.6\.1 predate bb-0\.6\.2: turret slots \(build\.turrets\) and belt joins /);
    } finally {
      srv.closeAllConnections();
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });
});
