// 0.8.0 RC M1 (REQ-BFG-009, REQ-BFG-016, REQ-BFG-011): rules bb-0.8.0. 0.8.0 changes battles (two heroes, fifteen parts,
// B1's numbers), so the rules string moves: a new rules version starts a fresh ghost pool, and the server's rules gate
// turns 0.7.0's bb-0.6.2 uploads away.
//  - On both stores (JSON lines, and Tigris through tools/fakeS3.ts), with uploads open in-process: a bb-0.8.0 upload of
//    each playable hero is stored (201); a bb-0.6.2 one is refused and nothing is stored: FURNACE and WEAVER meet the
//    exact rules check (422), FOUNDRY and BASTION already the decoder's hero gate (400).
//  - A 0.7.0 session meets the 0.8.0 server. 0.7.0's client is this build's online path under rules bb-0.6.2, so the
//    session here runs the game's own Online class with deps that send what a 0.7.0 client sends: the match request and
//    the signed upload carry bb-0.6.2. Its dawn fetch finds no bb-0.6.2 ghost (404) and falls back to the stand-in; its
//    dusk upload is refused (422) quietly: the run plays on to day 2 and nothing reaches the console. Where the store still
//    holds 0.7.0's bb-0.6.2 seed pool (the seed replaces only its own rules' pool), the match route serves a 0.7.0 client
//    one of those, never a bb-0.8.0 ghost, and its upload is still refused. (The browser check runs the real 0.7.0 page.)
//  - Offline (no server URL) a run of each of the four heroes through day 3 makes no request and opens no IndexedDB.
// BELTS (REQ-BFG-043, REQ-BFG-044): this build's rules are bb-0.8.3 (since PACKS, bb-0.8.6; since RUNES-1, bb-0.8.7). Where a check here meant this build's rules it reads
// RULES_VERSION or pins bb-0.8.7; HEROES_RULES stays bb-0.8.0 (the first rules that carry the four heroes), which
// RULES_VERSION is at or after. tests/belts.rules.test.ts turns bb-0.8.0's uploads and sessions away the same way.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { simulate, type SideStats } from "../src/sim/battle";
import { heroRefBuild, PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { HEROES_RULES, heroesFor, rulesAtLeast, sustainFeatures } from "../src/net/rulesGate"; // FLIP-X2: sustainFeatures
import { ghostId, SNAPSHOT_V3, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { withDawnRunes } from "./runeFill"; // FLIP-X2: an upload holds its day's runes
import { validateUpload } from "../src/net/validate";
import { fetchGhost, submitGhost } from "../src/net/ghostClient";
import { battleSeed, newRun, pendingRune, saveRun, SAVE_KEY, takeRune } from "../src/game/run"; // FLIP-X2: pendingRune, takeRune
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

const OLD_RULES = "bb-0.6.2"; // 0.7.0's rules (and 0.6.2's)
const NOSTATS = {} as SideStats;
const DAYS = [1, 5, 9];

function snapOf(hero: HeroId, day: number, rules: string, build: Build = heroRefBuild(hero, day)): GhostSnapshot {
  return { v: SNAPSHOT_VERSION, rules, hero, day, wins: 0, lives: 5, build, runId: `rc-${hero}-${day}`, playerId: `p-${hero}`, createdAt: 1_790_000_000_000 };
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

/** FLIP-X2: `s` as a client before bb-0.8.7 (runes) sends it, 0.7.0's among them: a rune-less v2 snapshot, no
 *  build.runes and no run seed. Rules before bb-0.8.7 refuse a deck holding runes, and this build's decks hold them. */
function runeless(s: GhostSnapshot): GhostSnapshot {
  const out: GhostSnapshot = { ...s, v: SNAPSHOT_VERSION, build: { ...s.build } };
  delete out.seed;
  delete out.build.runes;
  return out;
}

/** A 0.7.0 client's deps: the game's own fetch and upload, with 0.7.0's rules string on the request and the snapshot. */
function as070(identity: Identity, sent: GhostSnapshot[] = []): OnlineDeps {
  return {
    fetchGhost: (url, req, ms, o) => fetchGhost(url, { ...req, rules: OLD_RULES }, ms, o),
    submitGhost: (url, snap, id, ms) => {
      // FLIP-X2: the deck as a 0.7.0 client sends it, rune-less v2 (was { ...snap, rules: OLD_RULES }, which now holds the
      // run's dawn rune in v3 with its seed: bb-0.6.2 refuses that at the encoder, so no 422 would come back)
      const old = { ...runeless(snap), rules: OLD_RULES };
      sent.push(old);
      return submitGhost(url, old, id, ms);
    },
    identity: async () => identity, store: mem(), now: () => 1_790_000_000_000, save: () => {},
  };
}

describe("rules bb-0.8.7: the version", () => {
  it("RULES_VERSION is bb-0.8.7 (RUNES-1), at or after bb-0.8.0, the first rules that carry the four playable heroes (HEROES_RULES); bb-0.6.2 carries FURNACE and WEAVER", () => {
    expect(RULES_VERSION).toBe("bb-0.9.1") /* BAL-2: the bump (was bb-0.9.0; FLIP-X2: was bb-0.8.7) */;
    // the RC's bump made RULES_VERSION HEROES_RULES itself; BELTS's comes after it, and the table needs no new row
    expect(HEROES_RULES).toBe("bb-0.8.0");
    expect(rulesAtLeast(RULES_VERSION, HEROES_RULES)).toBe(true);
    expect([...heroesFor(RULES_VERSION)]).toEqual([...PLAYABLE_HEROES]);
    expect([...heroesFor(OLD_RULES)]).toEqual(["furnace", "weaver"]);
  });
});

describe.each(storeBackends())("the rules gate on the $name store (uploads open in-process)", (backend) => {
  let app: GhostServer, base: string, me: Identity;
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
  const post = async (s: GhostSnapshot) => {
    const body = JSON.stringify(ownedBy(s, me));
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    return { status: r.status, body: (await r.json()) as { id?: string; error?: string } };
  };
  const ask = (rules: string, day = 3) => fetch(`${base}/v1/ghosts/match?rules=${rules}&day=${day}&wins=1&lives=5&player=rc-new&seen=&runs=0`);

  it("/v1/health names bb-0.8.7, and the match route serves bb-0.8.7 seed ghosts and no bb-0.6.2 ghost", async () => {
    expect(((await (await fetch(`${base}/v1/health`)).json()) as { rules: string }).rules).toBe("bb-0.9.1") /* BAL-2: the bump (was bb-0.9.0; FLIP-X2: was bb-0.8.7) */;
    const now = await ask(RULES_VERSION);
    expect(now.status).toBe(200);
    expect(((await now.json()) as { snapshot: GhostSnapshot }).snapshot.rules).toBe("bb-0.9.1") /* BAL-2: the bump (was bb-0.9.0; FLIP-X2: was bb-0.8.7) */;
    const old = await ask(OLD_RULES);
    expect(old.status).toBe(404);
    await old.text();
  });

  it("takes a bb-0.8.7 upload of each playable hero (201, stored) and refuses every bb-0.6.2 one, storing nothing: 422 for FURNACE and WEAVER, 400 for FOUNDRY and BASTION", async () => {
    const before = backend.storedRecords();
    let stored = 0;
    for (const hero of PLAYABLE_HEROES) for (const day of DAYS) {
      // FLIP-X2: an upload under RULES_VERSION holds exactly its day's runes (neutral ones, tests/runeFill.ts) and travels
      // in v3 (was heroRefBuild(hero, day) rune-less in snapOf's v2); the bb-0.6.2 upload stays the rune-less v2 deck a
      // 0.7.0 client sends (rules before bb-0.8.7 refuse runes)
      const ref = heroRefBuild(hero, day);
      const deck = withDawnRunes(ref, day);
      const up = { ...snapOf(hero, day, RULES_VERSION, deck), v: SNAPSHOT_V3 };
      expect(validateUpload(deck, day).ok, `${hero} d${day}`).toBe(true);
      const now = await post(up);
      expect(now.status, `${hero} d${day} ${RULES_VERSION}`).toBe(201);
      expect(now.body.id).toBe(ghostId(ownedBy(up, me)));
      stored++;
      expect((await app.store.bucket(RULES_VERSION, day)).map((e) => e.id)).toContain(now.body.id);
      const old = await post(snapOf(hero, day, OLD_RULES, ref));
      if (hero === "furnace" || hero === "weaver") {
        expect(old.status, `${hero} d${day} ${OLD_RULES}`).toBe(422);
        expect(old.body.error).toBe(`rules ${OLD_RULES} not accepted: this server validates bb-0.9.1`); // BAL-2: the server names bb-0.9.1 (was bb-0.9.0; FLIP-X2: was bb-0.8.7)
      } else {
        expect(old.status, `${hero} d${day} ${OLD_RULES}`).toBe(400);
        expect(old.body.error).toBe(`snapshot.hero: rules ${OLD_RULES} accept only FURNACE, WEAVER, not ${hero.toUpperCase()}`);
      }
    }
    expect(stored).toBe(12);
    expect(backend.storedRecords() - before).toBe(12);
    for (const day of DAYS) expect(await app.store.bucket(OLD_RULES, day)).toEqual([]);
  });

  it("a 0.7.0 session: its fetch falls back to the stand-in (404), its upload is refused quietly (422), and the run plays on to day 2 with no console line", async () => {
    const error = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    const debug = vi.spyOn(console, "debug");
    const before = backend.storedRecords();
    const sent: GhostSnapshot[] = [];
    try {
      const s = new Online(base, as070(me, sent));
      await until(() => s.active);
      const run = newRun("furnace", 7070);
      // FLIP-X2: the run takes its dawn rune, as the game makes it before the dusk: this build's online path uploads only
      // a deck validateUpload takes, which holds exactly `day` runes (was no rune taken: nothing was sent, sent = [])
      const offer = pendingRune(run);
      if (offer) takeRune(run, offer.ids[0]);
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
      expect(s.lastUpload).toMatchObject({ ok: false, status: 422 });
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

  it("where the store still holds 0.7.0's bb-0.6.2 seed pool, a 0.7.0 client is served one of those (never a bb-0.8.7 ghost), and its upload is still refused", async () => {
    // FURNACE and WEAVER's seed ghosts as a bb-0.6.2 pool (0.7.0's seed made its pool the same way, from its own decks)
    // FLIP-X2: this build's pool decks hold their day's runes (v3, with a seed) and bb-0.6.2 predates runes, so 0.7.0's
    // pool is them as 0.7.0 made them: rune-less v2, no seed, leaving out a deck holding a sustain piece (WARD BELL, MEND
    // PRESS, MENDING LOOM need bb-0.9.0; 0.7.0 had none). Was [...].map((s) => ({ ...s, rules: OLD_RULES })).
    const pool070 = [...sampleGhosts(), ...floorGhosts()].map((s) => ({ ...runeless(s), rules: OLD_RULES }))
      .filter((s) => sustainFeatures(s.build).length === 0);
    await app.store.replacePool(OLD_RULES, pool070.map((s) => ({ id: ghostId(s), snapshot: s })));
    try {
      const ids = new Set(pool070.map(ghostId));
      for (const day of [1, 3, 10]) {
        const r = await ask(OLD_RULES, day);
        expect(r.status, `day ${day}`).toBe(200);
        const body = (await r.json()) as { id: string; snapshot: GhostSnapshot };
        expect(body.snapshot.rules).toBe(OLD_RULES);
        expect(ids.has(body.id)).toBe(true);
      }
      const now = await ask(RULES_VERSION, 3); // a client of this build still meets bb-0.8.7 ghosts only
      expect(((await now.json()) as { snapshot: GhostSnapshot }).snapshot.rules).toBe(RULES_VERSION);
      const run = newRun("weaver", 7071);
      const up = await submitGhost(base, { ...ghostOf(run, 1_790_000_000_000, me.playerId), rules: OLD_RULES }, me, 3000);
      expect(up).toMatchObject({ ok: false, status: 422 });
    } finally {
      await app.store.replacePool(OLD_RULES, []);
    }
    expect(await app.store.bucket(OLD_RULES, 3)).toEqual([]);
  });
});

describe("offline play makes no request (no server URL)", () => {
  it("a run of each of the four heroes through day 3: no session, no request, no IndexedDB, only 0.6.2's storage keys", () => {
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
        const run = newRun(hero, 8080);
        let dusks = 0;
        while (!run.over && run.day <= 3) {
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
