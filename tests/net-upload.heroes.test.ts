// 0.8.0 H1 M2 (REQ-BFG-009, REQ-BFG-011): heroes by rules version. On v070-rc (rules bb-0.6.2) the strict decoder and the
// upload check took any hero in HEROES, so a FOUNDRY or BASTION ghost could be stored under bb-0.6.2 and served to 0.7.0
// players (output-H1/REPORT.md section 0). Now a table keyed by rules version (src/net/rulesGate.ts RULES_HEROES) says
// which heroes each rules version carries: bb-0.6.2 and everything before it FURNACE and WEAVER, the next rules version
// (HEROES_RULES, bb-0.8.0) the four. Both ways are tested on every accepting path: the decoder (so the server's POST, its
// stores and the seed check), the upload check, the client's check of a served ghost and the client's own upload.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HEROES, RULES_VERSION, type HeroId } from "../src/sim/content";
import { setTurretList, type Build } from "../src/sim/deck";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { HEROES_RULES, RULES_HEROES, heroGateProblem, heroesFor } from "../src/net/rulesGate";
import { SNAPSHOT_VERSION, checkSnapshot, decodeSnapshot, encodeSnapshot, ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { validateBuild, validateUpload } from "../src/net/validate";
import { fetchGhost, submitGhost, type GhostRequest } from "../src/net/ghostClient";
import { createGhostServer, type GhostServer } from "../server/app";
import { checkPool } from "../server/seed";
import { generateSamplePool } from "../tools/samplePool";
import { newRun } from "../src/game/run";
import { ghostOf } from "../src/game/day";
import { Online, stopOnline, type OnlineDeps } from "../src/game/online";
import type { Identity } from "../src/net/identity";
import { driveRuns } from "./uploadDriver";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

const NEW: readonly HeroId[] = ["foundry", "bastion"];
const OLD: readonly HeroId[] = ["furnace", "weaver"];
const DAYS = Array.from({ length: 10 }, (_, i) => i + 1);
const why = (rules: string, hero: string, list = "FURNACE, WEAVER") => `rules ${rules} accept only ${list}, not ${hero.toUpperCase()}`;
const clone = (b: Build): Build => JSON.parse(JSON.stringify(b)) as Build;

function snap(hero: HeroId, day: number, rules: string, build: Build = heroRefBuild(hero, day)): GhostSnapshot {
  return { v: SNAPSHOT_VERSION, rules, hero, day, wins: 0, lives: 5, build, runId: `h1-${hero}-${day}`, playerId: `p-${hero}`, createdAt: 1_790_000_000_000 };
}

describe("the table: heroes by rules version", () => {
  it("bb-0.6.2 and every earlier or unreadable version: FURNACE and WEAVER; HEROES_RULES (bb-0.8.0) and later: the four", () => {
    expect(RULES_VERSION).toBe("bb-0.6.2"); // RULES_VERSION stays; the 0.8.0 release step bumps it
    expect(HEROES_RULES).toBe("bb-0.8.0");
    expect(RULES_HEROES.map((r) => [r.from, [...r.heroes]])).toEqual([
      ["bb-0.0.0", ["furnace", "weaver"]], ["bb-0.8.0", ["furnace", "weaver", "foundry", "bastion"]],
    ]);
    for (const r of ["bb-0.4.0", "bb-0.6.1", "bb-0.6.2", "bb-0.7.0", "bb-0.7.1", "bb-0.7.99", "garbled", "", "BB-0.8.0", "bb-0.8", 7, null]) {
      expect([...heroesFor(r)], JSON.stringify(r)).toEqual(["furnace", "weaver"]);
    }
    for (const r of ["bb-0.8.0", "bb-0.8.1", "bb-0.9.0", "bb-1.0.0"]) expect([...heroesFor(r)], r).toEqual(["furnace", "weaver", "foundry", "bastion"]);
  });

  it("names the rules and the hero; METRONOME and SIPHON are in no row yet", () => {
    expect(heroGateProblem("bb-0.6.2", "foundry")).toBe(why("bb-0.6.2", "foundry"));
    expect(heroGateProblem("bb-0.6.2", "furnace")).toBeNull();
    expect(heroGateProblem("bb-0.8.0", "bastion")).toBeNull();
    expect(heroGateProblem("bb-0.8.0", "siphon")).toBe(why("bb-0.8.0", "siphon", "FURNACE, WEAVER, FOUNDRY, BASTION"));
    expect(heroGateProblem("nonsense", "weaver")).toBeNull();
    expect(heroGateProblem("nonsense", "foundry")).toBe(`rules "nonsense" accept only FURNACE, WEAVER, not FOUNDRY`);
  });
});

describe("the strict snapshot decoder", () => {
  it("under bb-0.6.2 refuses a FOUNDRY or BASTION snapshot (and METRONOME's and SIPHON's), naming the rule; FURNACE and WEAVER pass", () => {
    for (const hero of [...NEW, "metronome", "siphon"] as HeroId[]) for (const day of [1, 5, 10]) {
      const s = snap(hero, day, RULES_VERSION);
      expect(() => checkSnapshot(s), `${hero} d${day}`).toThrow(`snapshot.hero: ${why(RULES_VERSION, hero)}`);
      expect(() => decodeSnapshot(JSON.stringify(s)), `${hero} d${day}`).toThrow(/^snapshot\.hero: /);
      expect(() => encodeSnapshot(s), `${hero} d${day}`).toThrow(/^snapshot\.hero: /);
    }
    for (const hero of OLD) expect(checkSnapshot(snap(hero, 5, RULES_VERSION)).hero).toBe(hero);
  });

  it("under the next rules version takes both, and their snapshots round-trip byte for byte (all 20 reference builds and both start decks)", () => {
    for (const hero of NEW) {
      for (const day of DAYS) for (const build of [heroRefBuild(hero, day), heroStartBuild(hero, 1)]) {
        const s = snap(hero, day, HEROES_RULES, build);
        const text = encodeSnapshot(s);
        const back = decodeSnapshot(text);
        expect(back, `${hero} d${day}`).toEqual(checkSnapshot(s));
        expect(encodeSnapshot(back)).toBe(text);
        expect(ghostId(back)).toBe(ghostId(s));
      }
    }
    for (const hero of ["metronome", "siphon"] as HeroId[]) expect(() => checkSnapshot(snap(hero, 3, HEROES_RULES)), hero).toThrow(/^snapshot\.hero: /);
  });
});

describe("the upload check (validateUpload, the player mode)", () => {
  it("accepts all 20 reference builds and both start decks (every day) under the next rules version, and refuses each under bb-0.6.2 with the one rules error", () => {
    for (const hero of NEW) for (const day of DAYS) {
      for (const [name, b] of [["ref", heroRefBuild(hero, day)], ["start", heroStartBuild(hero, 1)]] as const) {
        expect(validateUpload(b, day, HEROES_RULES), `${hero} ${name} d${day}`).toEqual({ ok: true, errors: [] });
        expect(validateBuild(b, day).ok, `${hero} ${name} d${day} (strict)`).toBe(true);
        expect(validateUpload(b, day, RULES_VERSION), `${hero} ${name} d${day}`).toEqual({ ok: false, errors: [`rules: ${why(RULES_VERSION, hero)}`] });
        expect(validateUpload(b, day), `${hero} ${name} d${day} (default rules)`).toEqual({ ok: false, errors: [`rules: ${why(RULES_VERSION, hero)}`] });
      }
    }
    for (const hero of OLD) for (const day of DAYS) expect(validateUpload(heroRefBuild(hero, day), day).ok, `${hero} d${day}`).toBe(true);
  });

  it("honest mid-run decks from the upload driver (turrets, joins, stars, cores): every one accepted under the next rules version", () => {
    const runs = driveRuns(60, 31000, NEW);
    let n = 0;
    for (const r of runs) for (const d of r.dusks) {
      n++;
      expect(validateUpload(d.build, d.day, HEROES_RULES), `${d.hero} #${d.seed} d${d.day}`).toEqual({ ok: true, errors: [] });
      const s = snap(d.hero, d.day, HEROES_RULES, d.build);
      expect(decodeSnapshot(encodeSnapshot(s))).toEqual(checkSnapshot(s));
    }
    expect(n).toBe(600);
  }, 300_000);

  it("still refuses the usual dishonest variants, with the usual reasons, under the next rules version", () => {
    const cases: [string, (b: Build, hero: HeroId) => void, RegExp][] = [
      ["plating far past the ceiling", (b) => { b.hullBonus += 25 * 200; }, /^(supply|budget): /],
      ["another hero's signature factory", (b, hero) => { b.items.push({ uid: 777, def: hero === "foundry" ? "wardworks" : "crucible", x: 7, y: 8 }); }, /is another hero's signature factory/],
      ["a second signature factory", (b, hero) => { b.items.push({ uid: 777, def: HEROES[hero].factory, x: 7, y: 8 }); }, /^item: the deck must carry exactly one .* \(found 2\)$/],
      ["no signature factory", (b, hero) => { const s = b.items.find((p) => p.def === HEROES[hero].factory)!; b.items = b.items.filter((p) => p !== s); b.routes = b.routes.filter((r) => r.factory !== s.uid); }, /\(found 0\)$/],
      ["stars on the signature", (b, hero) => { b.items.find((p) => p.def === HEROES[hero].factory)!.stars = 2; }, /can't have 2 stars \(signatures and supplies never merge\)/],
      ["a METRONOME signature", (b) => { b.items.push({ uid: 777, def: "clockworks", x: 7, y: 8 }); }, /CLOCKWORKS is another hero's signature factory/],
      ["an unknown item", (b) => { b.items.push({ uid: 777, def: "zz_nothing", x: 7, y: 8 }); }, /unknown item "zz_nothing"/],
      ["a turret in a slot the hull lacks", (b) => { setTurretList(b, [{ slot: 7, def: "carronade", uid: 778 }]); }, /^turret: uid 778 is in slot 7; /],
      ["more belt than its capacity", (b) => { b.beltCap = 2; }, /belt tiles exceed beltCap 2|^supply: /],
      ["an unfused pair", (b) => { b.items.push({ uid: 777, def: "whetstone", x: 0, y: 9 }, { uid: 779, def: "whetstone", x: 9, y: 9 }); }, /UNFUSED PAIR: WHETSTONE ★1 x/],
    ];
    for (const hero of NEW) for (const day of [1, 4, 10]) for (const [what, change, want] of cases) {
      const b = clone(heroRefBuild(hero, day));
      change(b, hero);
      const v = validateUpload(b, day, HEROES_RULES);
      expect(v.ok, `${hero} d${day}: ${what}`).toBe(false);
      expect(v.errors.some((e) => want.test(e)), `${hero} d${day}: ${what}: ${v.errors.join(" | ")}`).toBe(true);
    }
  });
});

describe("the server and the client, both ways", () => {
  let app: GhostServer, dir: string, base: string, me: Identity;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-h1-heroes-"));
    app = createGhostServer({ dataDir: dir, log: () => {}, uploads: "open", rateLimit: { windowMs: 60_000, max: 1000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    me = await testIdentity(2);
  });
  afterAll(async () => {
    stopOnline();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const post = async (s: GhostSnapshot) => {
    const body = JSON.stringify(ownedBy(s, me));
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    return { status: r.status, body: (await r.json()) as { id?: string; error?: string } };
  };

  it("POST /v1/ghosts (uploads open, rules bb-0.6.2): FOUNDRY and BASTION are refused at the decoder and nothing is stored; FURNACE is stored", async () => {
    for (const hero of NEW) for (const day of [1, 6, 10]) {
      const r = await post(snap(hero, day, RULES_VERSION));
      expect(r.status, `${hero} d${day}`).toBe(400);
      expect(r.body.error).toBe(`snapshot.hero: ${why(RULES_VERSION, hero)}`);
      // the next rules version decodes, then meets this server's exact rules check
      const later = await post(snap(hero, day, HEROES_RULES));
      expect(later.status, `${hero} d${day} ${HEROES_RULES}`).toBe(422);
      expect(later.body.error).toBe(`rules ${HEROES_RULES} not accepted: this server validates ${RULES_VERSION}`);
    }
    expect(app.store.size).toBe(0);
    const ok = await submitGhost(base, ownedBy(snap("furnace", 3, RULES_VERSION), me), me, 3000);
    expect(ok).toMatchObject({ ok: true });
    expect(app.store.size).toBe(1);
  });

  it("fetchGhost: a served FOUNDRY ghost under bb-0.6.2 falls back (the client's decoder refuses it); a FURNACE one is fought", async () => {
    const srv = createServer((q, s) => {
      s.setHeader("content-type", "application/json");
      const hero: HeroId = (q.url ?? "").includes("wins=1") ? "foundry" : "furnace";
      s.end(JSON.stringify({ id: `g-${hero}`, snapshot: { ...snap(hero, 4, RULES_VERSION), wins: 0, playerId: `served-${hero}` } }));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const a = srv.address();
    const url = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
    const req = (wins: number): GhostRequest => ({ rules: RULES_VERSION, day: 4, wins, lives: 5, playerId: "me", seen: [], hero: "furnace", seed: 7, runs: 9 });
    try {
      expect(await fetchGhost(url, req(0), 2000)).toMatchObject({ source: "server", id: "g-furnace" });
      const off = await fetchGhost(url, req(1), 2000);
      expect(off.source).toBe("fallback");
      expect(off.error).toBe(`bad snapshot: snapshot.hero: ${why(RULES_VERSION, "foundry")}`);
      expect(["furnace", "weaver"]).toContain(off.snapshot.hero); // the stand-in a 0.7.0-era fallback would fight
    } finally {
      srv.closeAllConnections();
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });

  it("the game's own upload (Online.submitDusk): a FOUNDRY or BASTION dusk under bb-0.6.2 is never sent (one console.debug line); a FURNACE dusk is", async () => {
    const sent: unknown[] = [];
    const deps: OnlineDeps = {
      fetchGhost: (async () => { throw new Error("no fetch here"); }) as unknown as typeof fetchGhost,
      submitGhost: ((...x: unknown[]) => { sent.push(x); return new Promise(() => {}); }) as unknown as typeof submitGhost,
      identity: async () => me, store: null, now: () => 1_790_000_000_000, save: () => {},
    };
    const s = new Online("https://ghosts.example", deps);
    for (let i = 0; i < 50 && !s.active; i++) await new Promise((r) => setTimeout(r, 5));
    expect(s.active).toBe(true);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const hero of NEW) {
      const run = newRun(hero, 11);
      s.submitDusk(run);
      expect(sent, hero).toHaveLength(0);
      expect(s.lastUpload, hero).toEqual({ ok: false, refused: true, error: `rules: ${why(RULES_VERSION, hero)}` });
      expect(debug).toHaveBeenLastCalledWith(`[beltbattles] tonight's deck is not uploaded: rules: ${why(RULES_VERSION, hero)}`);
    }
    s.submitDusk(newRun("furnace", 11));
    expect(sent).toHaveLength(1);
    expect(error).not.toHaveBeenCalled();
    debug.mockRestore();
    error.mockRestore();
  });

  it("the seed check refuses a FOUNDRY ghost under bb-0.6.2; the real seed pool (FURNACE and WEAVER, 60 ghosts) passes as before", () => {
    const pool = generateSamplePool();
    expect(checkPool(pool)).toHaveLength(60);
    expect(new Set(pool.map((p) => p.hero))).toEqual(new Set(["furnace", "weaver"]));
    const bad = { ...pool[0], hero: "foundry", build: heroRefBuild("foundry", pool[0].day) };
    expect(() => checkPool([...pool, bad])).toThrow(/snapshot\.hero: rules bb-0\.6\.2 accept only FURNACE, WEAVER, not FOUNDRY/);
  });

  it("the player's own local ghosts (offline, never uploaded) keep every hero: ghostOf a FOUNDRY run is a bb-0.6.2 snapshot the client stores as it is", () => {
    const g = ghostOf(newRun("foundry", 3), 0, "p1");
    expect([g.hero, g.rules]).toEqual(["foundry", RULES_VERSION]);
    expect(() => checkSnapshot(g)).toThrow(/^snapshot\.hero: /); // so it can never reach a server or another player
  });
});
