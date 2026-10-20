// FIRSTDAY-1 (REQ-BFG-004; BRIEF-FIRSTDAY1 F4-F5, step 4): a first run's snapshots and the server. A first run's snapshot
// carries `firstRun: true`, last (day.ts ghostOf); every other snapshot omits it and encodes byte for byte as before. The
// upload check (POST /v1/ghosts -> validate.ts -> runes.ts runeProblem) re-derives days 1-2's rune offers by F3's rule
// when the flag is set and the gate is on; off, it refuses the flag. The same fixtures go through the client check
// (validateUpload in player mode, as online.ts submitDusk asks it) and POST /v1/ghosts, in both switch states.
// F5: the par player never plays a first run: with FIRST_RUN and PLAIN_RIGS on (every switch on) its decks are
// PLAIN_RIGS-on-alone's.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HeroId } from "../src/sim/content";
import { newRun, takeRune, pendingRune, type Run } from "../src/game/run";
import { finishDay, ghostOf } from "../src/game/day";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { checkSnapshot, encodeSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { createGhostServer, type GhostServer } from "../server/app";
import { FIRST_RUN_RUNES, firstRunRules, setFirstRun, withFirstRun } from "../src/sim/firstRun";
import { plainRigsRules, setPlainRigs, withPlainRigs } from "../src/sim/plainRigs";
import { hullScaleRules, setHullScale } from "../src/sim/hullScale";
import { ladderFixRules, setLadderFix } from "../src/sim/ladderFix";
import { npcDayRules, setNpcDay } from "../src/sim/npcDay"; // BUMP-1F (F1/Q5): + the switches' getters, to put each back as the test found it
import { firstRunRuneOffer, runeOffer } from "../src/sim/runes";
import { playerRun } from "../src/sim/harness/player";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

// BUMP-1F (F1/Q5, the suite guard tests/setup/itemsGuard.ts; RULING-BUMP1F-R5 R5.2 (2)): PLAIN_RIGS ships on, so the afterEach's setPlainRigs(false) took the six plain rigs out of ITEMS
// for good ("this test left ITEMS changed (122 keys became 116)"). A test that sets a switch puts it back as it found it: a beforeEach notes the two switches, the afterEach
// restores them (the guard's own afterEach runs after this one). Was afterEach(() => { setFirstRun(false); setPlainRigs(false); })
let found = { first: false, plain: false };
beforeEach(() => {
  found = { first: firstRunRules(), plain: plainRigsRules() };
});
afterEach(() => {
  setFirstRun(found.first);
  setPlainRigs(found.plain);
});

const both = <T>(fn: () => T): T => withPlainRigs(() => withFirstRun(fn));
const stats = { shots: 0, damage: 0, firstShot: -1, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
const CREATED = 1_790_000_000_000;

/** A seed whose normal dawn 1 doesn't offer IRON SKIN and whose dawn 2 (IRON SKIN held) offers a barred rune, which the
 *  first run replaces: `r2` is the replacement, so neither first-run pick was offered to a normal run on that seed. */
function pickSeed(): { seed: number; r2: string } {
  for (let seed = 1; seed < 5000; seed++) {
    if (runeOffer(seed, 1, "furnace", []).ids.includes("iron_skin")) continue;
    const base = runeOffer(seed, 2, "furnace", ["iron_skin"]).ids;
    const r2 = both(() => firstRunRuneOffer(seed, 2, "furnace", ["iron_skin"]).ids.find((id) => !base.includes(id)));
    if (r2) return { seed, r2 };
  }
  throw new Error("no seed");
}

/** An honest FURNACE run on `seed` (a first run when the gate is on and `first`): dawn 1's pick, then (to day 2) a dusk and
 *  dawn 2's pick; its snapshot at that dusk, as online.ts uploads it. */
function honest(seed: number, first: boolean, r1: string, r2: string | null, runId: string): GhostSnapshot {
  const run: Run = newRun("furnace", seed, runId, first);
  expect(takeRune(run, r1).ok, `${runId} dawn 1 ${r1} of ${pendingRune(run)?.ids}`).toBe(true);
  if (r2) {
    finishDay(run, 0, 10, stats, stats);
    expect(takeRune(run, r2).ok, `${runId} dawn 2 ${r2} of ${pendingRune(run)?.ids}`).toBe(true);
  }
  return ghostOf(run, CREATED, "p-fd1", "TESTER");
}

const ctxOf = (s: GhostSnapshot) => ({ seed: s.seed, ...(s.firstRun ? { firstRun: true } : {}) });
const client = (s: GhostSnapshot) => validateUpload(s.build, s.day, s.rules, ctxOf(s));
const strip = (s: GhostSnapshot): GhostSnapshot => {
  const c = { ...s };
  delete c.firstRun;
  return c;
};

describe("F4: the snapshot field", () => {
  it("a first run's snapshots carry firstRun: true, last; every other snapshot omits it, byte for byte as before", () => {
    const { seed, r2 } = pickSeed();
    const normalOff = encodeSnapshot(honest(seed, false, runeOffer(seed, 1, "furnace", []).ids[0], null, "n1"));
    both(() => {
      const f = honest(seed, true, "iron_skin", r2, "f2");
      expect(f.firstRun).toBe(true);
      const keys = Object.keys(f);
      expect(keys[keys.length - 1]).toBe("firstRun");
      const text = encodeSnapshot(f);
      expect(text.endsWith(',"firstRun":true}')).toBe(true);
      const back = checkSnapshot(JSON.parse(text));
      expect(back.firstRun).toBe(true);
      expect(encodeSnapshot(back)).toBe(text);
      expect(isSnapshot(f)).toBe(true);
      // a normal run with the gate on snapshots exactly as with the gate off
      expect(encodeSnapshot(honest(seed, false, runeOffer(seed, 1, "furnace", []).ids[0], null, "n1"))).toBe(normalOff);
      expect(normalOff.includes("firstRun")).toBe(false);
    });
  });

  it("off, the decoder and the local pool refuse the flag; it must be true and v3", () => {
    const { seed, r2 } = pickSeed();
    const f = both(() => honest(seed, true, "iron_skin", r2, "f2"));
    expect(() => checkSnapshot(f)).toThrow(/snapshot\.firstRun: not in this rules version yet/);
    expect(isSnapshot(f)).toBe(false);
    withPlainRigs(() => expect(() => checkSnapshot(f)).toThrow(/firstRun: not in this rules version yet/)); // FIRST_RUN off
    both(() => {
      expect(() => checkSnapshot({ ...f, firstRun: false })).toThrow(/snapshot\.firstRun: expected true/);
      expect(isSnapshot({ ...f, firstRun: 1 } as unknown as GhostSnapshot)).toBe(false);
    });
  });
});

describe("F4: the client check and POST /v1/ghosts, the same fixtures, both switch states", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-firstday1-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("on: an honest first run is accepted with its flag and refused without it; a normal deck claiming the flag is refused; off: the flag is refused", async () => {
    const me = await testIdentity(0);
    let n = 0;
    const post = async (s: GhostSnapshot): Promise<{ status: number; body: { errors?: string[]; error?: string } }> => {
      const body = JSON.stringify(ownedBy({ ...s, runId: `${s.runId}-${n++}` }, me));
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      return { status: r.status, body: (await r.json()) as { errors?: string[]; error?: string } };
    };
    const { seed, r2 } = pickSeed();
    const normalPick = runeOffer(seed, 1, "furnace", []).ids.find((id) => !FIRST_RUN_RUNES.includes(id))!; // not one of the plain three
    // the fixtures, built once with the gate on (a first run's picks are only offered there)
    const f1 = both(() => honest(seed, true, "iron_skin", null, "fd1-f1"));
    const f2 = both(() => honest(seed, true, "iron_skin", r2, "fd1-f2"));
    const n1 = honest(seed, false, normalPick, null, "fd1-n1");
    expect(f1.firstRun).toBe(true);
    expect(n1.firstRun).toBeUndefined();
    const claim = { ...n1, firstRun: true as const }; // a normal deck claiming the flag
    const lines: string[] = [];

    // ---- the gate on
    setPlainRigs(true);
    setFirstRun(true);
    for (const s of [f1, f2, n1]) {
      expect(client(s).errors, `on ${s.runId}`).toEqual([]);
      const r = await post(s);
      expect(r.status, `on ${s.runId} ${JSON.stringify(r.body)}`).toBe(201);
    }
    for (const s of [strip(f1), strip(f2), claim]) {
      const c = client(s);
      expect(c.ok, `on, refused: ${s.runId} ${s.firstRun ? "(claims the flag)" : "(no flag)"}`).toBe(false);
      expect(c.errors[0]).toMatch(/^rune: runes\[0\]: .* was not offered at the dawn of day 1$/);
      const r = await post(s);
      expect(r.status).toBe(422);
      expect(r.body.errors).toEqual(c.errors);
      lines.push(`on, ${s.runId}${s.firstRun ? " +flag" : " no flag"}: ${c.errors[0]}`);
    }

    // ---- the gate off (FIRST_RUN off; PLAIN_RIGS on and off)
    for (const plain of [true, false]) {
      setFirstRun(false);
      setPlainRigs(plain);
      for (const s of [f1, f2]) {
        const c = client(s);
        expect(c.errors).toEqual(["firstRun: not in this rules version yet"]);
        const r = await post(s);
        expect(r.status, `off ${s.runId}`).toBe(400);
        expect(JSON.stringify(r.body)).toMatch(/firstRun: not in this rules version yet/);
        const c2 = client(strip(s));
        expect(c2.ok).toBe(false);
        const r2b = await post(strip(s));
        expect(r2b.status).toBe(422);
        expect(r2b.body.errors).toEqual(c2.errors);
      }
      expect(client(n1).errors).toEqual([]);
      expect((await post(n1)).status).toBe(201);
      lines.push(`off (PLAIN_RIGS ${plain ? "on" : "off"}), the flag: ${client(f1).errors[0]}`);
    }
    expect(app.store.size).toBe(5); // on: f1, f2, n1; off: n1 twice
    console.log(`FIRSTDAY1 F4 lines (seed ${seed}, dawn 2 ${r2}):\n${lines.join("\n")}`);
  });

  it("claiming the flag narrows days 1-2 to plain runes; every first-run pick is one a normal seed already offers", () => both(() => {
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) {
      for (const id of FIRST_RUN_RUNES) {
        let s = 1;
        while (!runeOffer(s, 1, hero, []).ids.includes(id)) s++;
        expect(s, `${hero} ${id}`).toBeLessThan(200);
      }
    }
  }));
});

describe("F5: bots, captains and stand-ins never play a first run", () => {
  it("every switch on plus PLAIN_RIGS: the par player's decks with FIRST_RUN on equal FIRST_RUN off's", () => {
    const trace = { onDecide: () => undefined }; // bypasses the par-run cache (a fresh run each call)
    const was = { hull: hullScaleRules(), ladder: ladderFixRules(), npc: npcDayRules(), plain: plainRigsRules() }; // BUMP-1F (F1/Q5): the shipped switches are on; the finally puts each back as found (was false)
    setHullScale(true);
    setLadderFix(true);
    setNpcDay(true);
    setPlainRigs(true);
    try {
      for (const hero of ["furnace", "bastion"] as HeroId[]) {
        for (const seed of [1, 2]) {
          const off = JSON.stringify(playerRun(hero, 4, seed, trace));
          const on = withFirstRun(() => JSON.stringify(playerRun(hero, 4, seed, trace)));
          expect(on, `${hero} ${seed}`).toBe(off);
        }
      }
    } finally {
      // BUMP-1F (F1/Q5; RULING-BUMP1F-R5 R5.2 (2)): in the reverse order of turning them on, each as found (was setHullScale(false); setLadderFix(false); setNpcDay(false); setPlainRigs(false),
      // which left LADDER_FIX off (ITEMS.quench QUENCH TANK, was KINDLING) and PLAIN_RIGS off (116 keys, was 122) in the shipped world)
      setPlainRigs(was.plain);
      setNpcDay(was.npc);
      setLadderFix(was.ladder);
      setHullScale(was.hull);
    }
  }, 300_000);
});
