// PACKS M2 (REQ-BFG-063): player names at POST /v1/ghosts, on both stores (JSON lines, and Tigris on the fake S3). Every
// upload under RULES_VERSION carries a valid name: 201 and stored with it; otherwise 422 with exactly one reason and
// nothing stored. The client's isSnapshot takes exactly what the server takes (a table through both). Through the game's
// own client: the stored name goes up with every dusk, a NAME change reaches later uploads only, and a second device
// meets the named ghost as NAME#TAG · W-L; a seed ghost is a WANDERER; a stand-in captain keeps its name. The seed pool
// carries no names and still seeds.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULES_VERSION } from "../src/sim/content";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { ghostId, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { nameTag, WANDERER } from "../src/net/names";
import { fetchGhost, submitGhost } from "../src/net/ghostClient";
import { isSnapshot, setPlayerName } from "../src/game/ghostSnapshot";
import { foeTitle, onlineFoe, startDusk, storedFoe } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import { Online, RUNS_KEY, type OnlineDeps } from "../src/game/online";
import { newRun, type Run } from "../src/game/run";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import { seedStore } from "../server/seed";
import { floorGhosts, generateSamplePool, sampleGhosts } from "../tools/samplePool";
import { storeBackends } from "./netStores";
import { signedHeaders, testIdentity } from "./netIdentity";

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

/** A run at the dusk of `day` carrying `wins` wins and `lives` lives (a record a run reaches: losses = START_LIVES - lives). */
function runAt(hero: "furnace" | "weaver", seed: number, day: number, wins: number, lives: number): Run {
  const run = newRun(hero, seed);
  run.day = day;
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

  /** A day-1 dusk of `me` (0W, 5 lives), its own runId each time, with `name` (absent when undefined). */
  const dusk = (name?: unknown): Record<string, unknown> => ({
    v: SNAPSHOT_VERSION, rules: RULES_VERSION, hero: "furnace", day: 1, wins: 0, lives: 5, build: heroStartBuild("furnace"),
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
    const old = JSON.stringify({ ...s, rules: "bb-0.8.3" });
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
      const run = runAt("furnace", 4242, 4, 2, 4); // dusk 4 at 2 wins, 1 loss
      startDusk(run, [], { ghost: null });
      s1.submitDusk(run);
      await until(() => s1.lastUpload !== null);
      expect(s1.lastUpload).toMatchObject({ ok: true });
      const first = (s1.lastUpload as { id: string }).id;
      // the options card's NAME entry: a new name, then the next dusk
      setPlayerName("BOB-7");
      run.day = 5;
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
      const theirs = runAt("weaver", 77, 4, 2, 4);
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
      expect(foeTitle(foe)).toBe(`${WANDERER} · ${foe.record!.wins}-${2 - foe.record!.wins}`);
      // no answer (or a fallback): the day's stand-in captain, by its own name
      const stand = onlineFoe(runAt("weaver", 5, 2, 1, 5), null);
      expect(stand.kind).toBe("standin");
      expect(foeTitle(stand)).toBe(standInFoe(5, 2).name);
    });
  });
});

describe("the whole seed pool carries no names", () => {
  it("generateSamplePool(): every ghost nameless, as the seed writes it", () => {
    const pool = generateSamplePool();
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.filter((s) => s.name !== undefined)).toEqual([]);
  }, 120_000);
});
