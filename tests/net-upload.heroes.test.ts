// 0.8.0 H1 M2 (REQ-BFG-009, REQ-BFG-011): heroes by rules version. On v070-rc (rules bb-0.6.2) the strict decoder and the
// upload check took any hero in HEROES, so a FOUNDRY or BASTION ghost could be stored under bb-0.6.2 and served to 0.7.0
// players (output-H1/REPORT.md section 0). Now a table keyed by rules version (src/net/rulesGate.ts RULES_HEROES) says
// which heroes each rules version carries: bb-0.6.2 and everything before it FURNACE and WEAVER, the next rules version
// (HEROES_RULES, bb-0.8.0) the four. Both ways are tested on every accepting path: the decoder (so the server's POST, its
// stores and the seed check), the upload check, the client's check of a served ghost and the client's own upload.
// 0.8.0 RC (REQ-BFG-009; oracle 96e0ebe434a93f2b): the release step bumped RULES_VERSION to HEROES_RULES. Where a test
// here means 0.7.0's rules it now says so (OLD_RULES, bb-0.6.2), with the same expectations; the server and the client
// run bb-0.8.0, so FOUNDRY and BASTION travel there.
// BELTS (REQ-BFG-043, REQ-BFG-044): RULES_VERSION moves on to bb-0.8.3, after HEROES_RULES, which stays bb-0.8.0 (the
// first rules that carry the four). The server and the client run bb-0.8.3: where a POST here meant this server's rules
// by HEROES_RULES it says RULES_VERSION now, and under HEROES_RULES itself the exact rules check refuses it (422).
// FLIP-X2 (cap's ruling 5d6d83ef57d1494c, item 5): an upload holds exactly `day` runes, and runes need bb-0.8.7 (rulesGate
// RUNES_RULES), so no deck passes validateUpload under HEROES_RULES (bb-0.8.0) any more: rune-less it fails the count, with
// runes the rules gate. Where an upload here must pass, it holds its day's neutral runes (tests/runeFill.ts) under
// RULES_VERSION (which carries the four heroes too) and travels as a v3 snapshot; the hero-gate refusals under bb-0.6.2 keep
// their rune-less decks, as a bb-0.6.2 client's were. The game's own runs take their dawn rune first (pendingRune).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HEROES, ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { setTurretList, type Build } from "../src/sim/deck";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { HEROES_RULES, RULES_HEROES, heroGateProblem, heroesFor } from "../src/net/rulesGate";
import { SNAPSHOT_V3, SNAPSHOT_VERSION, checkSnapshot, decodeSnapshot, encodeSnapshot, ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { validateBuild, validateUpload } from "../src/net/validate";
import { fetchGhost, submitGhost, type GhostRequest } from "../src/net/ghostClient";
import { createGhostServer, type GhostServer } from "../server/app";
import { checkPool } from "../server/seed";
import { generateSamplePool } from "../tools/samplePool";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { ghostOf } from "../src/game/day";
import { Online, stopOnline, type OnlineDeps } from "../src/game/online";
import type { Identity } from "../src/net/identity";
import { driveRuns } from "./uploadDriver";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { withDawnRunes } from "./runeFill";

const NEW: readonly HeroId[] = ["foundry", "bastion"];
const OLD: readonly HeroId[] = ["furnace", "weaver"];
const OLD_RULES = "bb-0.6.2"; // 0.8.0 RC: 0.7.0's rules (RULES_VERSION until the release step)
const DAYS = Array.from({ length: 10 }, (_, i) => i + 1);
const why = (rules: string, hero: string, list = "FURNACE, WEAVER") => `rules ${rules} accept only ${list}, not ${hero.toUpperCase()}`;
const clone = (b: Build): Build => JSON.parse(JSON.stringify(b)) as Build;

/** FLIP-X2: a deck holding runes travels as v3 (build.runes is v3 only, as tools/samplePool.ts seedGhost writes them); a
 *  rune-less one stays v2 as before. */
function snap(hero: HeroId, day: number, rules: string, build: Build = heroRefBuild(hero, day)): GhostSnapshot {
  return { v: build.runes ? SNAPSHOT_V3 : SNAPSHOT_VERSION, rules, hero, day, wins: 0, lives: 5, build, runId: `h1-${hero}-${day}`, playerId: `p-${hero}`, createdAt: 1_790_000_000_000 };
}
/** FLIP-X2: `hero`'s reference deck of `day` holding its day's neutral runes (an upload under RULES_VERSION). */
const refUp = (hero: HeroId, day: number): Build => withDawnRunes(heroRefBuild(hero, day), day);
/** FLIP-X2: a new run that took day 1's dawn rune, as the picker takes it (the first card, as tooling.ts playOut). */
function dawned(run: Run): Run {
  expect(takeRune(run, pendingRune(run)!.ids[0]).ok).toBe(true);
  return run;
}

describe("the table: heroes by rules version", () => {
  it("bb-0.6.2 and every earlier or unreadable version: FURNACE and WEAVER; HEROES_RULES (bb-0.8.0) and later: the four", () => {
    expect(RULES_VERSION).toBe("bb-0.9.7") /* Z-BUMP: the bump (was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7) */; // RUNES-1 bumped it (PACKS: bb-0.8.6, BELTS: bb-0.8.3) (0.8.0 RC: bb-0.6.2 -> bb-0.8.0, HEROES_RULES itself)
    expect(HEROES_RULES).toBe("bb-0.8.0"); // the first rules that carry the four: BELTS's bb-0.8.3, PACKS's bb-0.8.6 and RUNES-1's bb-0.8.7 need no new row
    expect(RULES_HEROES.map((r) => [r.from, [...r.heroes]])).toEqual([
      ["bb-0.0.0", ["furnace", "weaver"]], ["bb-0.8.0", ["furnace", "weaver", "foundry", "bastion"]],
    ]);
    for (const r of ["bb-0.4.0", "bb-0.6.1", "bb-0.6.2", "bb-0.7.0", "bb-0.7.1", "bb-0.7.99", "garbled", "", "BB-0.8.0", "bb-0.8", 7, null]) {
      expect([...heroesFor(r)], JSON.stringify(r)).toEqual(["furnace", "weaver"]);
    }
    for (const r of ["bb-0.8.0", "bb-0.8.1", "bb-0.8.3", "bb-0.9.0", "bb-1.0.0"]) expect([...heroesFor(r)], r).toEqual(["furnace", "weaver", "foundry", "bastion"]);
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
      const s = snap(hero, day, OLD_RULES);
      expect(() => checkSnapshot(s), `${hero} d${day}`).toThrow(`snapshot.hero: ${why(OLD_RULES, hero)}`);
      expect(() => decodeSnapshot(JSON.stringify(s)), `${hero} d${day}`).toThrow(/^snapshot\.hero: /);
      expect(() => encodeSnapshot(s), `${hero} d${day}`).toThrow(/^snapshot\.hero: /);
    }
    for (const hero of OLD) expect(checkSnapshot(snap(hero, 5, OLD_RULES)).hero).toBe(hero);
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
        // FLIP-X2: under HEROES_RULES the hero gate takes FOUNDRY and BASTION (no "rules:" error), and the one error left is
        // the exact rune count (was { ok: true, errors: [] }): a bb-0.8.0 deck holds no runes, and with its day's runes
        // the rules gate refuses it (runes need bb-0.8.7), so no upload passes under bb-0.8.0 any more
        expect(validateUpload(b, day, HEROES_RULES), `${hero} ${name} d${day}`).toEqual({ ok: false, errors: [`rune: runes: 0 held on day ${day}, one a dawn (${day})`] });
        expect(validateUpload(withDawnRunes(b, day), day, HEROES_RULES), `${hero} ${name} d${day} with runes`).toEqual({ ok: false, errors: ["rules: rules bb-0.8.0 predate bb-0.8.7: runes (build.runes) need bb-0.8.7 or later"] });
        expect(validateBuild(b, day).ok, `${hero} ${name} d${day} (strict)`).toBe(true);
        expect(validateUpload(b, day, OLD_RULES), `${hero} ${name} d${day}`).toEqual({ ok: false, errors: [`rules: ${why(OLD_RULES, hero)}`] });
        // 0.8.0 RC: the default rules are this build's, bb-0.8.0 = HEROES_RULES (before the bump: refused like bb-0.6.2);
        // since BELTS bb-0.8.3, after HEROES_RULES, so the same answer. FLIP-X2: the deck holds its day's runes
        expect(validateUpload(withDawnRunes(b, day), day), `${hero} ${name} d${day} (default rules)`).toEqual({ ok: true, errors: [] });
      }
    }
    for (const hero of OLD) for (const day of DAYS) expect(validateUpload(refUp(hero, day), day).ok, `${hero} d${day}`).toBe(true); // FLIP-X2: with its runes
  });

  it("honest mid-run decks from the upload driver (turrets, joins, stars, cores): every one accepted under the next rules version", () => {
    const runs = driveRuns(60, 31000, NEW);
    let n = 0;
    for (const r of runs) for (const d of r.dusks) {
      n++;
      // FLIP-X2: the driver's decks hold their dawns' runes (tests/uploadDriver.ts), which need bb-0.8.7: checked and
      // encoded under RULES_VERSION, the rules after HEROES_RULES that carry the four heroes and the runes (was
      // HEROES_RULES, bb-0.8.0, which now refuses any deck with runes at the rules gate)
      // AZ-BUMP (the flip, NPC_DAY): with the run's road log and seed, as the upload carries them (Dusk.roadLog / runSeed: day.ts
      // ghostOf's snapshot.road and seed; server/app.ts passes both, with its LAST CHANCE): the player mode counts a deck's
      // drops only through its road log (validate.ts roadDropValue). With NPC_DAY off the dusk has none: as before
      const seed = (d.runSeed ?? 0) >>> 0;
      const ctx = { ...(seed ? { seed } : {}), ...(d.lastChance ? { lastChance: d.lastChance } : {}), ...(d.roadLog ? { road: d.roadLog } : {}) };
      expect(validateUpload(d.build, d.day, RULES_VERSION, ctx), `${d.hero} #${d.seed} d${d.day}`).toEqual({ ok: true, errors: [] });
      const s = snap(d.hero, d.day, RULES_VERSION, d.build);
      expect(decodeSnapshot(encodeSnapshot(s))).toEqual(checkSnapshot(s));
    }
    expect(n).toBe(600);
  }, 300_000);

  it("still refuses the usual dishonest variants, with the usual reasons, under the next rules version", () => {
    const cases: [string, (b: Build, hero: HeroId) => void, RegExp][] = [
      ["plating far past the ceiling", (b) => { b.hullBonus += ITEMS.plating.supply!.hull! * 200; }, /^(supply|budget): /], // NUM-1: 200 plates of 250 (was 25 * 200)
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
      // FLIP-X2: the deck holds its day's runes and is checked under RULES_VERSION, which carries the four heroes and the
      // runes (was the rune-less deck under HEROES_RULES: the count, or with runes the rules gate, refused it first)
      const b = clone(refUp(hero, day));
      change(b, hero);
      const v = validateUpload(b, day, RULES_VERSION);
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

  it("POST /v1/ghosts (uploads open, this server's rules bb-0.8.7): FOUNDRY and BASTION under bb-0.6.2 are refused at the decoder, and stored under bb-0.8.7 (under bb-0.8.0, HEROES_RULES, the exact rules check refuses them: 422); FURNACE under bb-0.6.2 meets the exact rules check (422) and is stored under bb-0.8.6", async () => {
    for (const hero of NEW) for (const day of [1, 6, 10]) {
      const r = await post(snap(hero, day, OLD_RULES));
      expect(r.status, `${hero} d${day}`).toBe(400);
      expect(r.body.error).toBe(`snapshot.hero: ${why(OLD_RULES, hero)}`);
      // 0.8.0 RC: HEROES_RULES was this server's rules, so they were stored under it (before the RC's bump: 422). BELTS:
      // this server's rules are RULES_VERSION (bb-0.8.7), so they are stored there, and HEROES_RULES meets the exact check
      const was = await post(snap(hero, day, HEROES_RULES));
      expect(was.status, `${hero} d${day} ${HEROES_RULES}`).toBe(422);
      expect(was.body.error).toBe(`rules ${HEROES_RULES} not accepted: this server validates ${RULES_VERSION}`);
      // FLIP-X2: under this server's rules the upload holds its day's runes, as a v3 snapshot (was the rune-less v2 deck)
      const now = await post(snap(hero, day, RULES_VERSION, refUp(hero, day)));
      expect(now.status, `${hero} d${day} ${RULES_VERSION}`).toBe(201);
      expect(now.body.id).toBe(ghostId(ownedBy(snap(hero, day, RULES_VERSION, refUp(hero, day)), me)));
    }
    expect(app.store.size).toBe(6);
    const old = await post(snap("furnace", 3, OLD_RULES)); // a 0.7.0 client's upload: decodes, then the exact rules check
    expect(old.status).toBe(422);
    expect(old.body.error).toBe(`rules ${OLD_RULES} not accepted: this server validates ${RULES_VERSION}`);
    expect(app.store.size).toBe(6);
    const ok = await submitGhost(base, ownedBy(snap("furnace", 3, RULES_VERSION, refUp("furnace", 3)), me), me, 3000); // FLIP-X2: with its runes
    expect(ok).toMatchObject({ ok: true });
    expect(app.store.size).toBe(7);
  });

  it("fetchGhost: a served FOUNDRY ghost under bb-0.6.2 falls back (the client's decoder refuses it); a FURNACE one is fought, and since the RC a FOUNDRY one under this build's rules too (bb-0.8.0 then, bb-0.8.3 since BELTS)", async () => {
    const srv = createServer((q, s) => {
      s.setHeader("content-type", "application/json");
      const u = q.url ?? "";
      const [hero, rules]: [HeroId, string] = u.includes("wins=1") ? ["foundry", OLD_RULES] : u.includes("wins=2") ? ["foundry", RULES_VERSION] : ["furnace", RULES_VERSION];
      // FLIP-X2: a ghost served under this build's rules holds its day's runes (v3), as every upload it passed did; the
      // bb-0.6.2 one stays rune-less (was rune-less under both)
      const build = rules === RULES_VERSION ? refUp(hero, 4) : heroRefBuild(hero, 4);
      s.end(JSON.stringify({ id: `g-${hero}-${rules}`, snapshot: { ...snap(hero, 4, rules, build), wins: 0, playerId: `served-${hero}` } }));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const a = srv.address();
    const url = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
    const req = (wins: number): GhostRequest => ({ rules: RULES_VERSION, day: 4, wins, lives: 5, playerId: "me", seen: [], hero: "furnace", seed: 7, runs: 9 });
    try {
      expect(await fetchGhost(url, req(0), 2000)).toMatchObject({ source: "server", id: `g-furnace-${RULES_VERSION}` });
      const off = await fetchGhost(url, req(1), 2000);
      expect(off.source).toBe("fallback");
      expect(off.error).toBe(`bad snapshot: snapshot.hero: ${why(OLD_RULES, "foundry")}`);
      expect(["furnace", "weaver"]).toContain(off.snapshot.hero); // the stand-in a 0.7.0-era fallback would fight
      expect(await fetchGhost(url, req(2), 2000)).toMatchObject({ source: "server", id: `g-foundry-${RULES_VERSION}` });
    } finally {
      srv.closeAllConnections();
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });

  it("the game's own upload (Online.submitDusk): under this build's rules (bb-0.8.0 since the RC, bb-0.8.3 since BELTS) a FOUNDRY, a BASTION and a FURNACE dusk are each sent, with no console line", async () => {
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
    // 0.8.0 RC: before the bump each FOUNDRY or BASTION dusk was refused here (not sent, one console.debug line)
    // FLIP-X2: each run takes day 1's dawn rune first (dawned), as a run must before its dusk; without it the client's own
    // check (validateUpload, the exact count) refuses the dusk (not sent, one console.debug line)
    NEW.forEach((hero, i) => {
      s.submitDusk(dawned(newRun(hero, 11)));
      expect(sent, hero).toHaveLength(i + 1);
      expect((sent[i] as [string, { hero: string; rules: string }])[1]).toMatchObject({ hero, rules: RULES_VERSION });
    });
    s.submitDusk(dawned(newRun("furnace", 11)));
    expect(sent).toHaveLength(3);
    expect(debug).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    debug.mockRestore();
    error.mockRestore();
  });

  it("the seed check refuses a FOUNDRY ghost under bb-0.6.2; the real seed pool (the four playable heroes, 120 ghosts since the RC) passes", () => {
    const pool = generateSamplePool();
    expect(checkPool(pool)).toHaveLength(120); // 0.8.0 RC: FOUNDRY and BASTION joined FURNACE and WEAVER's 60 (oracle 96e0ebe434a93f2b)
    expect(new Set(pool.map((p) => p.hero))).toEqual(new Set(["furnace", "weaver", "foundry", "bastion"]));
    const bad = { ...pool[0], rules: OLD_RULES, hero: "foundry", build: heroRefBuild("foundry", pool[0].day) };
    expect(() => checkPool([...pool, bad])).toThrow(/snapshot\.hero: rules bb-0\.6\.2 accept only FURNACE, WEAVER, not FOUNDRY/);
    // AZ-BUMP (the flip): generateSamplePool's race decks are par runs, longer with the NPC day (a warlord battle every day);
    // a host timeout under the 1.5-CPU quota, not the rule (was the 30 s default)
  }, 600_000);

  it("the player's own ghosts keep every hero: ghostOf a FOUNDRY run is a snapshot of this build's rules (bb-0.8.0 since the RC, bb-0.8.3 since BELTS), which the strict decoder now accepts", () => {
    const g = ghostOf(newRun("foundry", 3), 0, "p1");
    expect([g.hero, g.rules]).toEqual(["foundry", RULES_VERSION]);
    expect(checkSnapshot(g).hero).toBe("foundry"); // 0.8.0 RC: before the bump (bb-0.6.2) the decoder refused it
    expect(() => checkSnapshot({ ...g, rules: OLD_RULES })).toThrow(/^snapshot\.hero: /); // under 0.7.0's rules it still can't travel
  });
});
