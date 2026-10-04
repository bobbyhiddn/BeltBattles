// BELTS M3 (REQ-BFG-043, REQ-BFG-044): rules bb-0.8.3. BELTS changes which decks are legal (belt slots by level, the
// hero's two gold upgrades in Build.upgrades), so the rules string moves from bb-0.8.0 to bb-0.8.3: a new rules version
// starts a fresh ghost pool, and the server's exact rules check turns 0.8.0-0.8.4's bb-0.8.0 uploads away. Modelled on
// tests/rc.rules.test.ts (the 0.8.0 RC's bump), on both stores (JSON lines, and Tigris through tools/fakeS3.ts), uploads
// open in-process, the store seeded as a deploy seeds it:
//  - the gate: /v1/health names bb-0.8.3 and the match route serves bb-0.8.3 seed ghosts, none under bb-0.8.0; the same
//    honest deck of each playable hero is stored under bb-0.8.3 (201) and refused under bb-0.8.0 (422), as is a deck with
//    the gold upgrades, and nothing is stored under bb-0.8.0; bb-0.8.3's near misses are refused too (a check loosened to
//    "bb-0.8" would take bb-0.8.0, the live pool's rules);
//  - a bb-0.8.0 session (what a 0.8.4 page sends): its fetch falls back to the stand-in (404), its upload is refused
//    quietly (422), the run plays on to day 2, and nothing reaches the console; where the store still holds a bb-0.8.0
//    pool, such a page is served one of those, never a bb-0.8.3 ghost, and its upload is still refused;
//  - uploads with the gold upgrades, honest decks (every belt connected, whole crates, within maxGoldByDay) on a record a
//    run carries into that dusk: FURNACE at FACTORY level 2 with the KILN on 3 belts gets 201 and on 4 belts is refused
//    (at level 1 so are 3 belts; at level 3, 4 belts get 201); WEAVER with the LOOM at level 1 on 3 belts gets 201 and on
//    4 belts is refused (at level 2, 4 belts get 201); FACTORY or TURRET SPEED at level 4 on day 1 is over the budget
//    (60 gold against 8; on day 6, 63 gold, it gets 201); level 5 fails the strict decoder (400); a WEAVER deck holding a
//    KILN and a KILN with 2 stars are refused (422); an honest run that bought its levels uploads them through the game's
//    own client (201, stored with build.upgrades). Nothing refused is stored.
//  - Offline (no server URL) a run of each of the four heroes through day 3, buying the levels it can afford, makes no
//    request and opens no IndexedDB.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HEROES, ITEMS, RULES_VERSION, UPGRADE_TRACKS, type HeroId } from "../src/sim/content";
import { hullSlots, key as K, setTurretList, startingTurrets, type Build, type BuildTurret } from "../src/sim/deck";
import { simulate, type SideStats } from "../src/sim/battle";
import { heroRefBuild, heroStartBuild, PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { gradeOf, outputsAt, upgradeGold } from "../src/sim/stars";
import { HEROES_RULES, heroesFor, parseRules, rulesAtLeast } from "../src/net/rulesGate";
import { isReachable } from "../src/net/records";
import { encodeSnapshot, ghostId, SnapshotError, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { buildCost, maxGoldByDay, maxHonestSpend, validateBuild, validateUpload } from "../src/net/validate";
import { fetchGhost, submitGhost } from "../src/net/ghostClient";
import { battleSeed, buyUpgrade, newRun, saveRun, SAVE_KEY, type Run } from "../src/game/run";
import { duskFoe, finishDay, ghostOf, startDusk, storedFoe } from "../src/game/day";
import { GHOST_KEY, loadPool, saveGhost, standInFoe } from "../src/game/ghosts";
import { PLAYER_KEY } from "../src/game/ghostSnapshot";
import { Online, resolveServerUrl, type OnlineDeps } from "../src/game/online";
import { foeNote, online, onlineMode } from "../src/game/session";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import { seedStore } from "../server/seed";
import { floorGhosts, sampleGhosts } from "../tools/samplePool";
import { storeBackends } from "./netStores";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

const OLD_RULES = "bb-0.8.0"; // 0.8.0 to 0.8.4's rules (HEROES_RULES): the live pool's
const NOSTATS = {} as SideStats;
const T0 = 1_790_000_000_000;
const DAYS = [1, 5, 9];
/** bb-0.8.3's near misses: the rules it replaces first, then its neighbours and garbled forms. */
const NEAR = [OLD_RULES, "bb-0.8.2", "bb-0.8.4", "bb-0.8.3x", "BB-0.8.3", " bb-0.8.3", "bb-0.8.3 ", "bb-0.8.03", "bb-0.8.30", "bb-0.8.3.0", "bb-0.8", "bb_0.8.3"];
const PATTERN_OK = (r: string) => /^[A-Za-z0-9._-]{1,32}$/.test(r); // src/net/snapshot.ts RULES_PATTERN
const refused = (rules: string) => `rules ${rules} not accepted: this server validates bb-0.8.3`;
const slotError = (name: string, routes: number, outs: number) => `route: ${name} uid 1 feeds ${routes} routes but has ${outs} output(s)`;

/** A dusk snapshot on a record a run carries into it: every fight won, all 5 lives. */
function dusk(hero: HeroId, day: number, build: Build, rules = RULES_VERSION, runId = `belts-${hero}-${day}`): GhostSnapshot {
  return { v: SNAPSHOT_VERSION, rules, hero, day, wins: day - 1, lives: 5, build, runId, playerId: `p-${hero}`, createdAt: T0 };
}

/** `b` with the fewest whole belt crates its belt tiles need, as the shop sells them. */
function crated(b: Build): Build {
  const tiles = b.routes.reduce((s, r) => s + r.cells.length, 0), base = HEROES[b.hero].belt, crate = ITEMS.beltcrate.supply!.belt!;
  return { ...b, beltCap: base + crate * Math.ceil(Math.max(0, tiles - base) / crate) };
}

/** `hero`'s starting deck with a bought CARRONADE (6 gold, belts on both columns) in the hull's extra slot. */
function withCarronade(hero: "furnace" | "weaver"): Build {
  const b = heroStartBuild(hero); // the signature factory is uid 1
  const extra = hullSlots(hero).findIndex((s) => !s.start);
  const list: BuildTurret[] = [...startingTurrets(hero), { slot: extra, def: "carronade", uid: 93 }];
  setTurretList(b, list);
  return b;
}

/** FURNACE: the starting KILN (uid 1 at 4,6) on `n` belts (1-4): its starting belt into the SCRAP CANNON's column 4, then
 *  column 5, and the CARRONADE's columns 8 and 9 in the extra slot; FACTORY level `level`. */
function kilnDeck(n: number, level: number): Build {
  const b = withCarronade("furnace");
  const more = [
    [K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)],
    [K(6, 6), K(7, 6), K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)],
    [K(6, 7), K(7, 7), K(8, 7), K(9, 7), K(9, 6), K(9, 5), K(9, 4), K(9, 3), K(9, 2), K(9, 1), K(9, 0)],
  ];
  b.routes = [...b.routes, ...more.slice(0, n - 1).map((cells) => ({ factory: 1, cells }))];
  return crated({ ...b, ...(level > 1 ? { upgrades: { factory: level } } : {}) });
}

/** WEAVER: the starting LOOM (uid 1 at 4,5) on its three starting belts into the DART GUNs' inner columns 4, 1 and 8, and
 *  (`n` = 4) a fourth into a CARRONADE's column 6 in the extra slot; `upgrades` as given. */
function loomDeck(n: 3 | 4, upgrades?: Build["upgrades"]): Build {
  const b = n === 3 ? heroStartBuild("weaver") : withCarronade("weaver");
  if (n === 4) b.routes = [...b.routes, { factory: 1, cells: [K(5, 4), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(6, 0)] }];
  return crated({ ...b, ...(upgrades ? { upgrades } : {}) });
}

function mem(): Storage & { keys(): string[] } {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()].sort(),
  };
}

async function until(cond: () => boolean, ms = 8000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** A 0.8.4 page's deps: the game's own fetch and upload, with 0.8.0's rules string on the request and the snapshot. */
function as080(identity: Identity, sent: GhostSnapshot[] = []): OnlineDeps {
  return {
    fetchGhost: (url, req, ms, o) => fetchGhost(url, { ...req, rules: OLD_RULES }, ms, o),
    submitGhost: (url, snap, id, ms) => {
      const old = { ...snap, rules: OLD_RULES };
      sent.push(old);
      return submitGhost(url, old, id, ms);
    },
    identity: async () => identity, store: mem(), now: () => T0, save: () => {},
  };
}

/** Fight tonight's dusk against the stand-in and finish the day (the run's own income, as a player earns it). */
function playDusk(run: Run): void {
  const foe = startDusk(run, [], { ghost: null });
  const b = simulate(run.build, foe.build, battleSeed(run));
  finishDay(run, b.winner ?? -1, b.t, NOSTATS, NOSTATS);
}

describe("rules bb-0.8.3: the version and its decks", () => {
  it("RULES_VERSION is bb-0.8.3, after bb-0.8.0 (HEROES_RULES): the same four heroes travel, and the hero table needs no row", () => {
    expect(RULES_VERSION).toBe("bb-0.8.3");
    expect(HEROES_RULES).toBe(OLD_RULES);
    expect(RULES_VERSION).not.toBe(OLD_RULES);
    expect(rulesAtLeast(RULES_VERSION, OLD_RULES)).toBe(true);
    expect([...heroesFor(RULES_VERSION)]).toEqual([...PLAYABLE_HEROES]);
    expect([...heroesFor(OLD_RULES)]).toEqual([...PLAYABLE_HEROES]); // so bb-0.8.0 meets the exact rules check: 422, not 400
    for (const r of NEAR) expect(r, JSON.stringify(r)).not.toBe(RULES_VERSION);
    expect(new Set(NEAR).size).toBe(NEAR.length);
  });

  it("the upload decks are what they say: honest but for the one rule each breaks (strict and player mode)", () => {
    // FURNACE, day 5 (50 gold): the KILN's slots at its FACTORY level are 2 / 3 / 4
    expect([1, 2, 3].map((l) => outputsAt("kiln", gradeOf(kilnDeck(1, l), { def: "kiln" })))).toEqual([2, 3, 4]);
    for (const [n, level] of [[3, 2], [4, 3]]) {
      const b = kilnDeck(n, level);
      expect([b.routes.length, upgradeGold(b), validateBuild(b, 5).errors, validateUpload(b, 5).errors], `${n} belts L${level}`).toEqual([n, level === 2 ? 10 : 30, [], []]);
      expect(buildCost(b).total, `${n} belts L${level}`).toBeLessThanOrEqual(maxGoldByDay(5));
    }
    expect(validateUpload(kilnDeck(4, 2), 5).errors).toEqual([slotError("KILN", 4, 3)]);
    expect(validateUpload(kilnDeck(3, 1), 5).errors).toEqual([slotError("KILN", 3, 2)]);
    expect(buildCost(kilnDeck(4, 2)).total).toBeLessThanOrEqual(maxGoldByDay(5)); // only the slots refuse it
    // WEAVER, day 4 (38 gold): the LOOM's lead, 3 / 4 at levels 1 / 2; TURRET SPEED level 2 on the starting DART GUNs
    for (const b of [loomDeck(3, { turret: 2 }), loomDeck(4, { turret: 2, factory: 2 })]) {
      expect([validateBuild(b, 4).errors, validateUpload(b, 4).errors], `${b.routes.length} belts`).toEqual([[], []]);
      expect(buildCost(b).total).toBeLessThanOrEqual(maxGoldByDay(4));
    }
    expect(validateUpload(loomDeck(4, { turret: 2 }), 4).errors).toEqual([slotError("LOOM", 4, 3)]);
    // day 1: 8 gold (a player's 8 + roadCap's 5); level 4 of either track costs 60
    expect([maxGoldByDay(1), maxHonestSpend(1), maxGoldByDay(6)]).toEqual([8, 13, 63]);
    for (const upgrades of [{ factory: 4 }, { turret: 4 }]) {
      const b = { ...heroStartBuild("furnace"), upgrades };
      expect(buildCost(b).total, JSON.stringify(upgrades)).toBe(60);
      expect(validateBuild(b, 1).errors.some((e) => e.startsWith("budget: build costs 60 gold") && e.endsWith("day 1 allows at most 8"))).toBe(true);
      expect(validateBuild(b, 6).errors).toEqual([]);
    }
    for (const day of [1, 3, 4, 5, 6]) expect(isReachable(day, day - 1, 5), `day ${day}`).toBe(true);
  });
});

describe.each(storeBackends())("rules bb-0.8.3 on the $name store (uploads open in-process)", (backend) => {
  let app: GhostServer, base: string, me: Identity;
  let k = 0;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 10_000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    me = await testIdentity(1);
    await seedStore(app.store);
  }, 120_000); // the seed builds the race ghosts (the par player's runs): seconds, more under load
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });
  /** POST the snapshot as `me`, as raw JSON (the decoder sees exactly this; the game's encoder refuses some of these). */
  const post = async (s: GhostSnapshot) => {
    const body = JSON.stringify(ownedBy(s, me));
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    return { status: r.status, body: (await r.json()) as { id?: string; error?: string; errors?: string[] } };
  };
  const ask = (rules: string, day = 3) => fetch(`${base}/v1/ghosts/match?rules=${encodeURIComponent(rules)}&day=${day}&wins=1&lives=5&player=belts-new&seen=&runs=0`);
  /** A 201: the id is the canonical snapshot's, and the store holds it under bb-0.8.3. */
  const stored = async (s: GhostSnapshot, what: string) => {
    const r = await post(s);
    expect(r.status, `${what}: ${JSON.stringify(r.body)}`).toBe(201);
    expect(r.body.id, what).toBe(ghostId(ownedBy(s, me)));
    expect((await app.store.bucket(RULES_VERSION, s.day)).map((e) => e.id), what).toContain(r.body.id);
    return r.body.id!;
  };
  /** A deck refusal: 422 with exactly validateUpload's errors. */
  const deckRefused = async (s: GhostSnapshot, errors: string[], what: string) => {
    const r = await post(s);
    expect([r.status, r.body.error], what).toEqual([422, "deck failed validation"]);
    expect(r.body.errors, what).toEqual(errors);
  };
  const fresh = (s: GhostSnapshot): GhostSnapshot => ({ ...s, runId: `${s.runId}-${k++}` });

  it("/v1/health names bb-0.8.3; the match route serves bb-0.8.3 seed ghosts, and has none under bb-0.8.0 (a fresh pool)", async () => {
    expect(((await (await fetch(`${base}/v1/health`)).json()) as { rules: string }).rules).toBe("bb-0.8.3");
    const now = await ask(RULES_VERSION);
    expect(now.status).toBe(200);
    expect(((await now.json()) as { snapshot: GhostSnapshot }).snapshot.rules).toBe("bb-0.8.3");
    for (const day of [1, 3, 10]) {
      const old = await ask(OLD_RULES, day);
      expect(old.status, `day ${day}`).toBe(404);
      await old.text();
    }
  });

  it("the gate takes bb-0.8.3 and refuses bb-0.8.0: the same honest deck of each playable hero is stored (201) under one and refused (422) under the other, and nothing is stored under bb-0.8.0", async () => {
    const before = backend.storedRecords();
    let n = 0;
    for (const hero of PLAYABLE_HEROES) for (const day of DAYS) {
      const deck = heroRefBuild(hero, day);
      await stored(dusk(hero, day, deck), `${hero} d${day} ${RULES_VERSION}`);
      n++;
      const old = await post(dusk(hero, day, deck, OLD_RULES));
      expect([old.status, old.body.error], `${hero} d${day} ${OLD_RULES}`).toEqual([422, refused(OLD_RULES)]);
    }
    // a deck with the gold upgrades meets the same check: they never pass under 0.8.0's rules
    const up = await post(dusk("furnace", 5, kilnDeck(3, 2), OLD_RULES, "belts-up-old"));
    expect([up.status, up.body.error]).toEqual([422, refused(OLD_RULES)]);
    expect(backend.storedRecords() - before).toBe(n);
    for (const day of [...DAYS, 5]) expect(await app.store.bucket(OLD_RULES, day, "all"), `day ${day}`).toEqual([]);
  });

  it("refuses every near miss of bb-0.8.3 on an honest FURNACE deck, bb-0.8.0 first: 422 at the exact rules check, 400 where the decoder's pattern refuses it; nothing stored", async () => {
    const before = backend.storedRecords();
    const deck = heroStartBuild("furnace"); // no turret slots, no joins: the decoder's rules gate has nothing to refuse
    const seen: Record<string, number> = {};
    for (const rules of NEAR) {
      const r = await post(dusk("furnace", 1, deck, rules, `belts-near-${k++}`));
      seen[JSON.stringify(rules)] = r.status;
      if (PATTERN_OK(rules)) expect(r.body.error, JSON.stringify(rules)).toBe(refused(rules));
      else expect(r.body.error, JSON.stringify(rules)).toMatch(/^snapshot\.rules: /);
    }
    expect(seen).toEqual(Object.fromEntries(NEAR.map((r) => [JSON.stringify(r), PATTERN_OK(r) ? 422 : 400])));
    expect(NEAR.filter((r) => parseRules(r) !== null)).toEqual([OLD_RULES, "bb-0.8.2", "bb-0.8.4", "bb-0.8.30"]);
    expect(backend.storedRecords()).toBe(before);
  });

  it("FURNACE: FACTORY level 2 with the KILN on 3 belts gets 201, on 4 belts is refused; at level 1 so are 3 belts; at level 3, 4 belts get 201", async () => {
    const before = backend.storedRecords();
    const id = await stored(fresh(dusk("furnace", 5, kilnDeck(3, 2))), "KILN L2, 3 belts");
    const held = (await app.store.bucket(RULES_VERSION, 5)).find((e) => e.id === id)!;
    expect([held.snapshot.build.upgrades, held.snapshot.build.routes.length]).toEqual([{ factory: 2 }, 3]);
    await deckRefused(fresh(dusk("furnace", 5, kilnDeck(4, 2))), [slotError("KILN", 4, 3)], "KILN L2, 4 belts");
    await deckRefused(fresh(dusk("furnace", 5, kilnDeck(3, 1))), [slotError("KILN", 3, 2)], "KILN L1, 3 belts");
    await stored(fresh(dusk("furnace", 5, kilnDeck(4, 3))), "KILN L3, 4 belts");
    expect(backend.storedRecords() - before).toBe(2);
  });

  it("WEAVER: the LOOM at level 1 on 3 belts gets 201 (with TURRET SPEED level 2), on 4 belts is refused; at level 2, 4 belts get 201", async () => {
    const before = backend.storedRecords();
    const id = await stored(fresh(dusk("weaver", 4, loomDeck(3, { turret: 2 }))), "LOOM L1, 3 belts");
    expect((await app.store.bucket(RULES_VERSION, 4)).find((e) => e.id === id)!.snapshot.build.upgrades).toEqual({ turret: 2 });
    await deckRefused(fresh(dusk("weaver", 4, loomDeck(4, { turret: 2 }))), [slotError("LOOM", 4, 3)], "LOOM L1, 4 belts");
    await stored(fresh(dusk("weaver", 4, loomDeck(4, { turret: 2, factory: 2 }))), "LOOM L2, 4 belts");
    expect(backend.storedRecords() - before).toBe(2);
  });

  it("level 4 of FACTORY or TURRET SPEED on day 1 is over the budget (60 gold against 8; a player's day 1 allows 13): 422; on day 6 (63 gold) the same deck gets 201", async () => {
    const before = backend.storedRecords();
    for (const upgrades of [{ factory: 4 }, { turret: 4 }]) {
      const b = { ...heroStartBuild("furnace"), upgrades };
      const r = await post(fresh(dusk("furnace", 1, b)));
      expect([r.status, r.body.error], JSON.stringify(upgrades)).toEqual([422, "deck failed validation"]);
      expect(r.body.errors, JSON.stringify(upgrades)).toEqual(validateUpload(b, 1).errors);
      expect(r.body.errors).toHaveLength(1);
      expect(r.body.errors![0]).toMatch(new RegExp(`^budget: build costs 60 gold \\(.*\\) but a player's day 1 allows at most ${maxHonestSpend(1)} `));
      await stored(fresh(dusk("furnace", 6, b)), `${JSON.stringify(upgrades)} day 6`);
    }
    expect(backend.storedRecords() - before).toBe(2);
  });

  it("level 5 fails the strict decoder (400) on either track, and the game's own encoder refuses it too; nothing stored", async () => {
    const before = backend.storedRecords();
    for (const track of UPGRADE_TRACKS) {
      const s = fresh(dusk("furnace", 10, { ...heroRefBuild("furnace", 10), upgrades: { [track]: 5 } as Build["upgrades"] }));
      const r = await post(s);
      expect([r.status, r.body.error], track).toEqual([400, `snapshot.build.upgrades.${track}: expected an integer in 1..4`]);
      expect(() => encodeSnapshot(ownedBy(s, me)), track).toThrow(SnapshotError);
    }
    expect(backend.storedRecords()).toBe(before);
  });

  it("a WEAVER deck holding a KILN, and a KILN with 2 stars, are refused (422) with the one reason each; nothing stored", async () => {
    const before = backend.storedRecords();
    const weaver = heroStartBuild("weaver");
    weaver.items.push({ uid: 2, def: "kiln", x: 0, y: 8 });
    await deckRefused(fresh(dusk("weaver", 4, weaver)), ["item: uid 2 KILN is another hero's signature factory"], "WEAVER with a KILN");
    const starred = kilnDeck(3, 2);
    starred.items[0].stars = 2;
    await deckRefused(fresh(dusk("furnace", 5, starred)), ["item: uid 1 KILN can't have 2 stars (signatures and supplies never merge)"], "a 2-star KILN");
    expect(backend.storedRecords()).toBe(before);
  });

  it("an honest run that bought TURRET SPEED and FACTORY level 2 uploads its dusk through the game's own client: 201, stored with its levels", async () => {
    const s = new Online(base, { fetchGhost, submitGhost, identity: async () => me, store: mem(), now: () => T0, save: () => {} });
    await until(() => s.active);
    const run = newRun("furnace", 8383);
    while (run.day < 3) {
      for (const t of UPGRADE_TRACKS) buyUpgrade(run, t); // what the day's gold allows (none on day 1: 8 gold)
      playDusk(run);
    }
    while (buyUpgrade(run, "factory").ok || buyUpgrade(run, "turret").ok) { /* spend what is left on the levels */ }
    expect(run.build.upgrades).toEqual({ turret: 2, factory: 2 }); // day 2's 15+ gold, then day 3's 13+
    expect(upgradeGold(run.build)).toBe(20);
    const want = ghostOf(run, T0, me.playerId);
    expect(validateUpload(want.build, want.day).ok).toBe(true);
    startDusk(run, [], { ghost: null });
    s.submitDusk(run);
    await until(() => s.lastUpload !== null);
    expect(s.lastUpload).toMatchObject({ ok: true, id: ghostId(want) });
    const held = (await app.store.bucket(RULES_VERSION, want.day)).find((e) => e.id === ghostId(want))!;
    expect(held.snapshot.build.upgrades).toEqual(run.build.upgrades);
  });

  it("a bb-0.8.0 session (a 0.8.4 page): its fetch falls back to the stand-in (404), its upload is refused quietly (422), and the run plays on to day 2 with no console line", async () => {
    const error = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    const debug = vi.spyOn(console, "debug");
    const before = backend.storedRecords();
    const sent: GhostSnapshot[] = [];
    try {
      const s = new Online(base, as080(me, sent));
      await until(() => s.active);
      const run = newRun("furnace", 8080);
      s.tick(run);
      await until(() => s.lastFetch !== null);
      s.tick(run);
      expect(s.lastFetch).toMatchObject({ source: "fallback", error: "no ghost on the server for this day" });
      const foe = storedFoe(run)!;
      expect(foe).toMatchObject({ kind: "standin", source: "offline", name: standInFoe(run.seed, 1).name });
      startDusk(run, [], { ghost: null });
      s.submitDusk(run);
      expect(sent).toHaveLength(1);
      expect([sent[0].rules, sent[0].hero, sent[0].day]).toEqual([OLD_RULES, "furnace", 1]);
      const b = simulate(run.build, foe.build, battleSeed(run));
      finishDay(run, b.winner ?? -1, b.t, NOSTATS, NOSTATS);
      await until(() => s.lastUpload !== null);
      expect(s.lastUpload).toMatchObject({ ok: false, status: 422, error: refused(OLD_RULES) });
      expect(run.over).toBeFalsy();
      expect(run.day).toBe(2);
      s.tick(run); // day 2's dawn fetch: the stand-in again
      await until(() => s.fetches === 2 && s.lastFetch?.snapshot.day === 2);
      s.tick(run);
      expect(storedFoe(run)).toMatchObject({ kind: "standin", source: "offline" });
      expect(backend.storedRecords()).toBe(before);
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(debug).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      warn.mockRestore();
      debug.mockRestore();
    }
  });

  it("where the store still holds a bb-0.8.0 pool, a 0.8.4 page is served one of those (never a bb-0.8.3 ghost), and its upload is still refused", async () => {
    const pool080 = [...sampleGhosts(), ...floorGhosts()].map((s) => ({ ...s, rules: OLD_RULES }));
    await app.store.replacePool(OLD_RULES, pool080.map((s) => ({ id: ghostId(s), snapshot: s })));
    try {
      const ids = new Set(pool080.map(ghostId));
      for (const day of [1, 3, 10]) {
        const r = await ask(OLD_RULES, day);
        expect(r.status, `day ${day}`).toBe(200);
        const body = (await r.json()) as { id: string; snapshot: GhostSnapshot };
        expect(body.snapshot.rules).toBe(OLD_RULES);
        expect(ids.has(body.id)).toBe(true);
      }
      const now = await ask(RULES_VERSION, 3); // this build still meets bb-0.8.3 ghosts only
      expect(((await now.json()) as { snapshot: GhostSnapshot }).snapshot.rules).toBe(RULES_VERSION);
      const run = newRun("weaver", 8081);
      const up = await submitGhost(base, { ...ghostOf(run, T0, me.playerId), rules: OLD_RULES }, me, 3000);
      expect(up).toMatchObject({ ok: false, status: 422, error: refused(OLD_RULES) });
    } finally {
      await app.store.replacePool(OLD_RULES, []);
    }
    expect(await app.store.bucket(OLD_RULES, 3)).toEqual([]);
  });
});

describe("offline play makes no request (no server URL), with the gold upgrades", () => {
  it("a run of each of the four heroes through day 3, buying the levels it can afford: no session, no request, no IndexedDB, only 0.6.2's storage keys", () => {
    const g = globalThis as { localStorage?: Storage };
    const store = mem();
    g.localStorage = store;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("no request may be made offline"); });
    let idb = 0;
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, get: () => { idb++; return undefined; } });
    try {
      expect(resolveServerUrl("", store, { origin: "https://beltbattles.example" })).toBeNull();
      expect(online()).toBeNull();
      expect(onlineMode()).toBe(false);
      for (const hero of PLAYABLE_HEROES) {
        const run = newRun(hero, 8383);
        let dusks = 0;
        while (!run.over && run.day <= 3) {
          for (const t of UPGRADE_TRACKS) buyUpgrade(run, t); // the caravan: what the day's gold allows
          online()?.tick(run);
          const preview = duskFoe(run, loadPool());
          expect(foeNote(run, preview)).toBeNull();
          const foe = startDusk(run, loadPool());
          expect(foe.source).toBeUndefined();
          const mine = ghostOf(run);
          const b = simulate(run.build, foe.build, battleSeed(run));
          expect(finishDay(run, b.winner ?? -1, b.t, NOSTATS, NOSTATS).record).toBeUndefined();
          saveGhost(mine);
          saveRun(run);
          dusks++;
        }
        expect(dusks, hero).toBe(3);
        expect(run.build.upgrades, hero).toEqual({ turret: 2, factory: 2 }); // both tracks at level 2 by day 3
      }
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(idb).toBe(0);
      expect(store.keys().every((k) => [SAVE_KEY, GHOST_KEY, PLAYER_KEY].includes(k))).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      delete (globalThis as { indexedDB?: unknown }).indexedDB;
      delete g.localStorage;
    }
  });
});
