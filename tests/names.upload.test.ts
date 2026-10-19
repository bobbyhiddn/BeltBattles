// PACKS M2 (REQ-BFG-063): player names at POST /v1/ghosts, on both stores (JSON lines, and Tigris on the fake S3). Every
// upload under RULES_VERSION carries a valid name: 201 and stored with it; otherwise 422 with exactly one reason and
// nothing stored. The client's isSnapshot takes exactly what the server takes (a table through both). Through the game's
// own client: the stored name goes up with every dusk, a NAME change reaches later uploads only, and a second device
// meets the named ghost as NAME#TAG · W-L; a seed ghost is a WANDERER; a stand-in captain keeps its name. The seed pool
// carries no names and still seeds.
// FLIP-X2 (cap's ruling 5d6d83ef57d1494c, item 5): an upload holds exactly `day` runes. The day-1 dusk posted here holds
// day 1's neutral rune (tests/runeFill.ts) in a v3 snapshot, and the game's own runs take each dawn's rune (pendingRune,
// takeRune), so every upload is refused or stored for its name alone, as before.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULES_VERSION } from "../src/sim/content";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { ghostId, SNAPSHOT_V3, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { nameTag, WANDERER } from "../src/net/names";
import { fetchGhost, submitGhost } from "../src/net/ghostClient";
import { isSnapshot, setPlayerName } from "../src/game/ghostSnapshot";
import { foeTitle, onlineFoe, startDusk, storedFoe } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import { Online, RUNS_KEY, type OnlineDeps } from "../src/game/online";
import { newRun, pendingRune, runeDawn, takeRune, type Run } from "../src/game/run";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import { seedStore } from "../server/seed";
import { uploadProblems, type StoredRecord } from "../server/ghostAdmin";
import { floorGhosts, generateSamplePool, sampleGhosts } from "../tools/samplePool";
import { storeBackends } from "./netStores";
import { signedHeaders, testIdentity } from "./netIdentity";
import { withDawnRunes } from "./runeFill";
import { runeGrants } from "../src/sim/runes";
import { START_LIVES } from "../src/sim/content"; // HULL-ON (the flip, HEARTS): an older-rules upload's 5-lives scale
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): this build's uploads carry hearts
import { withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the scaling switch, outermost around an older-rules check (the ITEMS key-order hazard)

const T0 = 1_790_000_000_000;
const rot13 = (s: string) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 65 + 13) % 26) + 65));
const BLOCKED = rot13("FU1G"); // a blocklist word with a digit swap (ROT13 here, so the file spells none out)

function mem(init: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

async function until(cond: () => boolean, ms = 8000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** FLIP-X2: the dawn of `day`: the held dawn-gold runes pay and the day's pick is owed (run.ts runeDawn, as day.ts finishDay
 *  calls it), then the run takes it as the picker does (takeRune; the first card, as tooling.ts playOut). */
function dawn(run: Run, day: number): void {
  run.day = day;
  runeDawn(run);
  expect(takeRune(run, pendingRune(run)!.ids[0]).ok, `dawn ${day}`).toBe(true);
}

/** A run at the dusk of `day` carrying `wins` wins and `lives` lives (a record a run reaches: losses = START_LIVES - lives).
 *  FLIP-X2: with the rune of each dawn up to `day` (dawn), as a run carries them into its dusk (it held none). */
function runAt(hero: "furnace" | "weaver", seed: number, day: number, wins: number, lives: number): Run {
  const run = newRun(hero, seed);
  for (let d = 1; d <= day; d++) dawn(run, d);
  run.wins = wins;
  run.losses = day - 1 - wins;
  run.lives = lives;
  return run;
}

describe.each(storeBackends())("player names at POST /v1/ghosts on the $name store", (backend) => {
  let app: GhostServer, base: string, me: Identity, other: Identity;
  let k = 0;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 10_000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    me = await testIdentity(0);
    other = await testIdentity(2);
  });
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  /** A day-1 dusk of `me` (0W, 10 hearts), its own runId each time, with `name` (absent when undefined). FLIP-X2: its deck
   *  holds day 1's rune, so it travels as v3 (was the rune-less v2 deck, which the exact count now refuses).
   *  HULL-ON (the flip, HEARTS): 5 lives -> HEARTS_START (10): day 1's one reachable record under this build's rules is
   *  0W 10 hearts (POST answered 422 "record: 0W 5 lives is no record a run carries into dusk 1").
   *  BUMP-1D (LONG_RUN ships on): and `losses: 0`, the dusks lost before day 1's: this build's rules (bb-0.11.0) are a long run's,
   *  whose upload states them (server/app.ts lossesProblem: 422 "losses: ..." after the name check, so a named dusk was refused). */
  const dusk = (name?: unknown): Record<string, unknown> => ({
    v: SNAPSHOT_V3, rules: RULES_VERSION, hero: "furnace", day: 1, wins: 0, lives: HEARTS_START, losses: 0, build: withDawnRunes(heroStartBuild("furnace"), 1),
    runId: `names-${k++}`, playerId: me.playerId, createdAt: T0, ...(name === undefined ? {} : { name }),
  });
  /** POST exactly this JSON, signed by `me`. */
  const post = async (s: Record<string, unknown>) => {
    const body = JSON.stringify(s);
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    return { status: r.status, body: (await r.json()) as { id?: string; error?: string } };
  };

  it("a named upload gets 201 and is stored with its name (and no tag)", async () => {
    const s = dusk("ANNA");
    const r = await post(s);
    expect(r).toEqual({ status: 201, body: { id: ghostId(s as unknown as GhostSnapshot) } });
    const held = (await app.store.bucket(RULES_VERSION, 1)).find((e) => e.id === r.body.id)!;
    expect(held.snapshot.name).toBe("ANNA");
    expect(JSON.stringify(held.snapshot).includes("#")).toBe(false);
  });

  it("too short, too long, bad characters, not allowed and missing: 422 with exactly its reason; nothing stored", async () => {
    const before = backend.storedRecords();
    const cases: [string, unknown, string][] = [
      ["too short", "A", "name: too short"], ["too long", "ABCDEFGHIJK", "name: too long"], ["lower case", "anna", "name: bad characters"],
      ["!", "ANNA!", "name: bad characters"], ["double space", "ANNA  B", "name: bad characters"], ["a tag", "ANNA#3F", "name: bad characters"],
      ["blocked", BLOCKED, "name: not allowed"], ["blocked, spaced", BLOCKED.split("").join(" "), "name: not allowed"],
      ["reserved", WANDERER, "name: not allowed"], ["empty", "", "name: missing"], ["absent", undefined, "name: missing"],
    ];
    for (const [what, name, error] of cases) expect(await post(dusk(name)), what).toEqual({ status: 422, body: { error } });
    // a name that is not a string is a shape error: 400, as any other
    expect(await post(dusk(7))).toEqual({ status: 400, body: { error: "snapshot.name: expected a string" } });
    expect(backend.storedRecords()).toBe(before);
  });

  it("the client's snapshot check takes exactly what the server takes: a table of names through both", async () => {
    const names: unknown[] = ["BO", "AN-NA 7", "WWWWWWWWWW", "R2-D2", "X", "ABCDEFGHIJK", "anna", " ANNA", "ANNA ", "ÅSA", "ANNA_B",
      WANDERER, "WAND-ERER", BLOCKED, "", 7, null, "CLASSIC", "SCUNTHORPE"];
    for (const name of names) {
      const s = dusk(name);
      const r = await post(s);
      expect([r.status === 201, isSnapshot(s)], JSON.stringify(name)).toEqual([isSnapshot(s), r.status === 201]);
      if (r.status !== 201) expect(r.status === 422 || r.status === 400, JSON.stringify(name)).toBe(true);
    }
    // the one difference, by design: no name at all. The client takes it (seed pool ghosts carry none); an upload needs one
    const none = dusk();
    expect([isSnapshot(none), (await post(none)).status]).toEqual([true, 422]);
  });

  it("the order holds: another key's playerId (403) and foreign rules (422) come before the name", async () => {
    const s = dusk(); // no name
    const body = JSON.stringify({ ...s, playerId: other.playerId });
    const r403 = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    expect(r403.status).toBe(403);
    // FLIP-X2: foreign rules as an older client sends them: bb-0.8.3 had no runes, so its dusk is the rune-less v2 deck
    // (this build's dusk holds a rune, which the decoder's rules gate refuses under bb-0.8.3 with a 400, before this check)
    // HULL-ON (the flip, HEARTS): and on its own rules' 5-lives scale (START_LIVES): dusk() now carries 10 hearts, which the
    // decoder's lives bound for bb-0.8.3 (1..9) refuses with a 400, before this check
    // BUMP-1D (LONG_RUN ships on): and without the `losses` this build's dusk states (a bb-0.8.3 client sends none, and the decoder
    // refuses the field under rules without a long run, 400, before this check; JSON.stringify leaves `undefined` out)
    const old = JSON.stringify({ ...s, v: SNAPSHOT_VERSION, build: heroStartBuild("furnace"), rules: "bb-0.8.3", lives: START_LIVES, losses: undefined });
    const r422 = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, old), body: old });
    expect([r422.status, ((await r422.json()) as { error: string }).error]).toEqual([422, `rules bb-0.8.3 not accepted: this server validates ${RULES_VERSION}`]);
  });

  describe("through the game's own client", () => {
    let fresh: GhostServer, url: string, d1: Identity, d2: Identity;
    beforeAll(async () => {
      fresh = backend.server({ uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 10_000 } }, true);
      url = `http://127.0.0.1:${await fresh.listen(0)}`;
      d1 = await testIdentity(1);
      d2 = await testIdentity(3);
    });
    afterAll(async () => {
      await fresh.close();
    });
    const deps = (id: Identity, runs = 0): OnlineDeps => ({
      fetchGhost, submitGhost, identity: async () => id, store: mem({ [RUNS_KEY]: JSON.stringify({ runs, last: "r" }) }), now: () => T0, save: () => {},
    });

    it("every dusk uploads the stored name; a NAME change reaches later uploads only; a second device meets NAME#TAG · W-L", async () => {
      const s1 = new Online(url, deps(d1));
      await until(() => s1.active);
      setPlayerName("ANNA"); // as the name screen stores it
      // HULL-ON (the flip, HEARTS): 4 -> 9 lives: the run (newRun under the flip) plays on hearts, and its one loss on days
      // 1-3 costs 1 heart (10 -> 9); 4 lives is no record a hearts run carries into dusk 4 (POST: 422)
      const run = runAt("furnace", 4242, 4, 2, 9); // dusk 4 at 2 wins, 1 loss
      startDusk(run, [], { ghost: null });
      s1.submitDusk(run);
      await until(() => s1.lastUpload !== null);
      expect(s1.lastUpload).toMatchObject({ ok: true });
      const first = (s1.lastUpload as { id: string }).id;
      // the options card's NAME entry: a new name, then the next dusk
      setPlayerName("BOB-7");
      dawn(run, 5); // FLIP-X2: day 5's dawn and its rune (was run.day = 5)
      run.wins = 3;
      run.dusk = null;
      startDusk(run, [], { ghost: null });
      s1.lastUpload = null;
      s1.submitDusk(run);
      await until(() => s1.lastUpload !== null);
      expect(s1.lastUpload).toMatchObject({ ok: true });
      const d4 = await fresh.store.bucket(RULES_VERSION, 4), d5 = await fresh.store.bucket(RULES_VERSION, 5);
      expect(d4.map((e) => [e.id, e.snapshot.name])).toEqual([[first, "ANNA"]]); // the earlier upload keeps its name
      expect(d5.map((e) => e.snapshot.name)).toEqual(["BOB-7"]);
      // a second device, past the new-player runs, at dusk 4 with the same record: it meets ANNA's ghost
      const s2 = new Online(url, deps(d2, 5));
      await until(() => s2.active);
      const theirs = runAt("weaver", 77, 4, 2, 9); // HULL-ON (the flip, HEARTS): the same record on hearts (was 4 lives)
      s2.tick(theirs);
      await until(() => s2.lastFetch !== null);
      s2.tick(theirs);
      const foe = storedFoe(theirs)!;
      expect(foe).toMatchObject({ kind: "ghost", source: "online", ghostId: first });
      expect(foe.record!.name).toBe("ANNA");
      expect(foeTitle(foe)).toBe(`ANNA#${nameTag(d1.playerId)} · 2-1`);
      expect(`VS ${foeTitle(foe)}`).toMatch(/^VS ANNA#[0-9A-F]{2} · 2-1$/);
    });

    it("the seed still writes the pool without names; a seed ghost meets a new player as WANDERER; a stand-in keeps its captain name", async () => {
      const pool = [...sampleGhosts(), ...floorGhosts()]; // the stand-in part of the seed pool (the race part: below)
      expect(pool.every((s) => s.name === undefined)).toBe(true);
      await seedStore(fresh.store, pool);
      for (const day of [1, 4, 9]) {
        const seeded = await fresh.store.bucket(RULES_VERSION, day, "pool");
        expect(seeded.length, `day ${day}`).toBeGreaterThan(0);
        expect(seeded.every((e) => e.snapshot.name === undefined), `day ${day}`).toBe(true);
      }
      const s3 = new Online(url, deps(await testIdentity(2), 0)); // a new player: the seed pool only (D2)
      await until(() => s3.active);
      const run = runAt("furnace", 99, 3, 1, 5);
      s3.tick(run);
      await until(() => s3.lastFetch !== null);
      s3.tick(run);
      const foe = storedFoe(run)!;
      expect(foe).toMatchObject({ kind: "ghost", source: "online" });
      expect(foe.record!.name).toBeUndefined();
      // BUMP-1D: the title reads the ghost's STATED losses (b4b8dd4: DuskFoe.record.losses, copied from a snapshot that states it; every
      // seed ghost of the long run does), the old derived 2 - wins only where the record has none (was `${wins}-${2 - wins}`, which is
      // wrong for a record holding draws)
      expect(foeTitle(foe)).toBe(`${WANDERER} · ${foe.record!.wins}-${foe.record!.losses ?? 2 - foe.record!.wins}`);
      // no answer (or a fallback): the day's stand-in captain, by its own name
      const stand = onlineFoe(runAt("weaver", 5, 2, 1, 5), null);
      expect(stand.kind).toBe("standin");
      expect(foeTitle(stand)).toBe(standInFoe(5, 2).name);
      // BUMP-1D (test only, time limit only, no assertion moves): 600 s, the GATE RULE's limit for a reader of the pool generators (tests/net-pool.test.ts
      // carries the same). The first sampleGhosts() + floorGhosts() of the process now plays the long run's casual floor runs (16 days, FLOOR_PICKS): ~21 s
      // alone, 29.2 s (a hair under the 30 s testTimeout of vite.config.ts) in the 12:59Z whole-suite run, over it under a heavier load
    }, 600_000);
  });
});

describe("ghosts:admin revalidate: an upload under this build's rules needs its name, as POST does", () => {
  it("a nameless upload lists name: missing; a named one passes; a refused name is the strict decode's; older rules ask none", () => {
    const s: GhostSnapshot = { ...sampleGhosts()[0], playerId: "p-admin", runId: "r-admin" };
    const rec = (snap: GhostSnapshot): StoredRecord => ({
      ref: "ghosts.jsonl:1", kind: "upload", day: snap.day, id: null, playerId: snap.playerId, keyed: false,
      text: JSON.stringify({ id: snap.name === "anna" ? "gnotanid0000001" : ghostId(snap), at: 5, snapshot: snap }), // a refused name has no id
    });
    expect(uploadProblems(rec(s), RULES_VERSION)).toEqual(["name: missing"]);
    expect(uploadProblems(rec({ ...s, name: "ANNA" }), RULES_VERSION)).toEqual([]);
    expect(uploadProblems(rec({ ...s, name: "anna" }), RULES_VERSION)).toEqual(["strict decode: name: bad characters"]);
    // FLIP-X2: the older-rules upload is the rune-less v2 deck an older client sent (was the v3 seed deck holding its day's
    // runes under bb-0.6.1, which the rules gate refuses: runes need bb-0.8.7); no runes, so no rune hull/belt and no seed
    // S8 (the pools: P1 83c039d's tuples carry a road log, so FURNACE / WEAVER seed ghosts do too): and no road log, v3 only and
    // gated by NPC_DAY's rules ("snapshot.road: not allowed in a v2 snapshot")
    // BUMP-1D: and no stated losses, a v3 field too (the seed pool is the long run's now, bb-0.11.0: every ghost states its losses; live only
    // under a long run's rules, src/net/snapshot.ts v3LiveFor; "snapshot.losses: not allowed in a v2 snapshot" at ghostId), the older
    // client's deck stated none (was { seed, road, ...rest })
    const { seed: _seed, road: _road, losses: _losses, ...rest } = s;
    // SOFT-1: the seed pool softened (REQ-BFG-092; tools/samplePool.ts SOFT1_PICKS): s's deck (furnace d1 variant 0) is a
    // par-field run's dusk deck now, which holds the starting turret (build.turrets), and bb-0.6.1 predates turret slots
    // (bb-0.6.2): the older client's deck held none, so the copy drops them too (was { runes, ...build }: "rules bb-0.6.1
    // predate bb-0.6.2: turret slots (build.turrets) need bb-0.6.2 or later" at ghostId)
    const { runes, turrets: _turrets, ...build } = s.build;
    const g = runeGrants(runes, s.day);
    // HULL-ON (the flip, HEARTS): on its own rules' 5-lives scale: s (day 1, 0W) is the shipped pool's, 10 hearts, which the
    // decoder's lives bound for bb-0.6.1 (1..9) refuses; the same record under bb-0.6.1 is 0W START_LIVES (5)
    const old: GhostSnapshot = { ...rest, v: SNAPSHOT_VERSION, rules: "bb-0.6.1", lives: START_LIVES, build: { ...build, hullBonus: build.hullBonus - g.hull, beltCap: build.beltCap - g.belt } };
    // BUMP-1E (THE ITEMS KEY-ORDER HAZARD): an older-rules check runs in the older rules' world (validate.ts validateUpload: inShapesWorld puts SHAPES-1's three and
    // SHAPES-2's six off, and inScaleWorld, nested INSIDE it, takes the seven scaling ids off and back on, then the nine come back), so ITEMS ended
    // [.., seven scaling ids, nine shaped ids] instead of [.., nine, seven] (the seven are the last keys while SCALE_RIGS is on, scale.ts), and every seeded draw
    // after it in this worker differed: the last test's generateSamplePool() threw 'SOFT-1: stale: the pick f3:c5680d21 for foundry day 1 no longer matches
    // its deck' (a fresh process resolves every pick, tests/soft1.picks.test.ts). The scaling switch is the OUTERMOST call, off first and back last, as
    // tests/net-upload.test.ts's catalogueOff reads: the same world (bb-0.6.1 predates SCALE_RULES, so inScaleWorld would have turned it off) and ITEMS keeps its order
    expect(withScaleRigs(() => uploadProblems(rec(old), "bb-0.6.1"), false).some((p) => p.startsWith("name:"))).toBe(false);
  });
});

describe("the whole seed pool carries no names", () => {
  it("generateSamplePool(): every ghost nameless, as the seed writes it", () => {
    const pool = generateSamplePool();
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.filter((s) => s.name !== undefined)).toEqual([]);
    // AZ-BUMP (the 1.5-CPU quota, the GATE RULE): 600 s (was 120 s), a host timeout, not the rule. generateSamplePool builds
    // the whole seed pool, as in joins.save's and net-fallback-standins' tests (600 s at 4af1683: 230 s alone at 283cfaf with
    // every switch off). This one: 10.5 s in S1's whole suite, 42.1 s in AZ-BUMP run 4's switch-on shard, 148 s in run 7's
    // shard s2-3 and over 120 s alone on the tree (run 7, gc-r7-alone-s23)
  }, 600_000);
});
