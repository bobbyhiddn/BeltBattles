// 0.6.2j BELT JOINS (REQ-BFG-027, J12): the join travels. Run saves keep it (save v7, no bump) and old saves load
// unchanged; GhostSnapshot v2 carries it as an optional route field that the encoder writes only when present
// (src/net/snapshot.ts, and the local mirror src/game/ghostSnapshot.ts); validateBuild (client and server) rejects an
// illegal join with a reason, in the words routeCheck.ts uses for the FIGHT gate.
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGhostServer } from "../server/app";
import { submitGhost } from "../src/net/ghostClient";
import { migrateRun, newRun, type Run } from "../src/game/run";
import * as local from "../src/game/ghostSnapshot";
import * as net from "../src/net/snapshot";
import { validateBuild } from "../src/net/validate";
import { routeProblems } from "../src/game/routeCheck";
import { RULES_VERSION } from "../src/sim/content";
import { key as K, type Build } from "../src/sim/deck";
import { simulate } from "../src/sim/battle";
import { warlordBuild } from "../src/sim/ai";
import { generateSamplePool } from "../tools/samplePool";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { withDawnRunes } from "./runeFill";

const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const R = [K(2, 6), K(2, 5), K(2, 4), K(3, 4)];
/** A legal day-1 FURNACE deck: the KILN's belt M into the turret, a STAMP PRESS's belt R joining it (8 gold). */
function joined(join: number | null = K(4, 4)): Build {
  return {
    hero: "furnace", mods: [], beltCap: 14, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }],
    routes: [{ factory: 1, cells: [...M] }, { factory: 2, cells: [...R], ...(join === null ? {} : { join }) }],
  };
}
function snap(build: Build, v: 1 | 2 = 2): net.GhostSnapshot {
  return { v, rules: RULES_VERSION, hero: build.hero, day: 1, wins: 0, lives: 5, build, runId: "run-1", playerId: "p-1", createdAt: 1 };
}
const netOk = (s: unknown) => { try { net.checkSnapshot(s); return true; } catch { return false; } };
/** FLIP-X2 (cap's ruling 5d6d83ef57d1494c, item 5): `build` as a day-1 upload: holding day 1's rune (an upload holds
 *  exactly `day` runes; a neutral one, tests/runeFill.ts), so in a v3 snapshot (build.runes travels only in v3). */
const upload = (build: Build): net.GhostSnapshot => ({ ...snap(withDawnRunes(build, 1)), v: net.SNAPSHOT_V3 });

describe("J12: validateBuild", () => {
  it("accepts a legal join: the joining belt claims no connector and is connected through the main belt", () => {
    expect(validateBuild(joined(), 1)).toEqual({ ok: true, errors: [] });
    expect(validateBuild(joined(null), 1).errors).toEqual(["route: route 1 does not end on a free turret connector (disconnected)"]);
  });

  it("rejects an illegal join with its reason (not adjacent, not a belt tile, itself, a loop), as routeCheck does", () => {
    const cases: [number, string][] = [
      [K(4, 3), "NOT NEXT TO ITS JOIN TILE"],
      [K(3, 3), "NOT A BELT TILE"],
      [K(2, 4), "CAN'T JOIN ITSELF"],
    ];
    for (const [join, why] of cases) {
      const b = joined(join);
      const v = validateBuild(b, 1);
      expect(v.ok).toBe(false);
      expect(v.errors).toEqual([`route: route 1 can't join cell ${join}: ${why}`, "route: route 1 does not end on a free turret connector (disconnected)"]);
      expect(routeProblems(b).map((p) => `route: ${p.why}`)).toEqual(v.errors); // the FIGHT gate says the same
    }
    const loop: Build = {
      hero: "furnace", mods: [], beltCap: 14, hullBonus: 0,
      items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }],
      routes: [
        { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3)], join: K(3, 3) },
        { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(2, 3), K(3, 3)], join: K(4, 3) },
      ],
    };
    const v = validateBuild(loop, 1);
    expect(v.errors.filter((e) => e.includes("WOULD LOOP"))).toEqual([
      "route: route 0 can't join cell 33: WOULD LOOP", "route: route 1 can't join cell 34: WOULD LOOP",
    ]);
    expect(routeProblems(loop).map((p) => `route: ${p.why}`)).toEqual(v.errors);
  });
});

describe("J12: GhostSnapshot v2 carries the join", () => {
  it("round-trips a joined deck; the encoder writes join on the joining route only", () => {
    const s = snap(joined());
    const text = net.encodeSnapshot(s);
    expect(text).toContain(`"routes":[{"factory":1,"cells":[${M.join(",")}]},{"factory":2,"cells":[${R.join(",")}],"join":44}]`);
    expect(net.decodeSnapshot(text)).toEqual(s);
    expect(net.encodeSnapshot(net.decodeSnapshot(text))).toBe(text);
    expect(net.ghostId(s)).not.toBe(net.ghostId(snap(joined(null))));
    expect(validateBuild(net.decodeSnapshot(text).build, 1).ok).toBe(true);
  });

  it("a snapshot without joins encodes and decodes exactly as before: no join key anywhere (the sample pool)", () => {
    // step 5: a caravan-bound stand-in pool (the 0.6.2 regen) may hold joined decks. They round-trip as they are; the
    // rest is the case named above.
    const sample = generateSamplePool();
    const plain = sample.filter((s) => s.build.routes.every((r) => r.join === undefined));
    expect(plain.length).toBeGreaterThan(0);
    for (const s of sample.filter((x) => !plain.includes(x))) expect(net.decodeSnapshot(net.encodeSnapshot(s))).toEqual(s);
    for (const s of plain) {
      const text = net.encodeSnapshot(s);
      expect(text).not.toContain("join");
      const back = net.decodeSnapshot(text);
      expect(back).toEqual(s);
      expect(back.build.routes.every((r) => !("join" in r))).toBe(true);
    }
  }, 600_000); // AZ-BUMP (JOINS-1 question 5; a host timeout, not the rule): generateSamplePool builds the whole seed pool
  // (the race heroes' par runs, every ghost through seedGhost's checks): 11.1 s in AZ-BUMP S1's whole suite, but 205-292 s
  // under the 1.5-CPU quota on the host (230 s alone at 283cfaf), over vitest's 30 s default

  it("the codec checks the join's shape only: v2, a cell key 0..99; its legality is validateBuild's", () => {
    expect(() => net.checkSnapshot(snap(joined(), 1))).toThrow(/routes\[1\]\.join: not allowed in a v1 snapshot/);
    for (const bad of [-1, 100, 4.5, "44", null]) {
      const b = joined();
      (b.routes[1] as unknown as Record<string, unknown>).join = bad;
      expect(() => net.checkSnapshot(snap(b))).toThrow(/routes\[1\]\.join/);
    }
    const illegal = snap(joined(K(3, 3)));
    expect(net.checkSnapshot(illegal).build.routes[1].join).toBe(K(3, 3));
    expect(validateBuild(illegal.build, 1).ok).toBe(false);
    const extra = joined();
    (extra.routes[1] as unknown as Record<string, unknown>).merge = 1;
    expect(() => net.checkSnapshot(snap(extra))).toThrow(/routes\[1\]\.merge: unknown field/);
  });

  it("the local pool's check (src/game/ghostSnapshot.ts) agrees with the codec on every join variant", () => {
    const variants: unknown[] = [snap(joined()), snap(joined(), 1), snap(joined(null)), snap(joined(null), 1)];
    for (const bad of [-1, 100, 4.5, "44"]) {
      const b = joined();
      (b.routes[1] as unknown as Record<string, unknown>).join = bad;
      variants.push(snap(b));
    }
    const verdicts = variants.map((s) => [local.isSnapshot(s), netOk(s)]);
    expect(verdicts).toEqual([[true, true], [false, false], [true, true], [true, true], [false, false], [false, false], [false, false], [false, false]]);
    const kept = local.migrateSnapshot(snap(joined()), "p-1")!;
    expect(kept.build.routes[1].join).toBe(K(4, 4));
  });
});

describe("J12: the ghost server (in-process) takes a legal join and refuses an illegal one with its reason", () => {
  it("POST /v1/ghosts: 201 for the joined deck, 422 with the join's error for an illegal one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bb-joins-"));
    const app = createGhostServer({ dataDir: dir, origins: [], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    try {
      const base = `http://127.0.0.1:${await app.listen(0)}`;
      const me = await testIdentity(0); // uploads are signed: each snapshot under the key's playerId
      // FLIP-X2: both uploads hold day 1's rune, v3 (upload; were snap's rune-less v2 decks, which the exact count refuses
      // before the routes are read)
      const ok = await submitGhost(base, ownedBy(upload(joined()), me), me, 3000);
      expect(ok.ok).toBe(true);
      const body = net.encodeSnapshot(ownedBy(upload(joined(K(3, 3))), me));
      const post = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      expect(post.status).toBe(422);
      expect(((await post.json()) as { errors: string[] }).errors).toContain("route: route 1 can't join cell 33: NOT A BELT TILE");
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("J12: run saves", () => {
  const withDeck = (b: Build): Run => {
    const run = newRun("furnace", 77, "joins-save");
    run.build = b;
    return run;
  };

  it("a join round-trips through a save and fights the same", () => {
    const run = withDeck(joined());
    const back = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(back.build).toEqual(joined());
    const a = simulate(run.build, warlordBuild("weaver", 1), 9), b = simulate(back.build, warlordBuild("weaver", 1), 9);
    expect([b.winner, b.t, b.sides[0].stats]).toEqual([a.winner, a.t, a.sides[0].stats]);
  });

  it("a save without joins loads unchanged, with no join", () => {
    const run = newRun("weaver", 12, "no-joins");
    const text = JSON.stringify(run);
    const back = migrateRun(JSON.parse(text))!;
    expect(JSON.stringify(back.build)).toBe(JSON.stringify(run.build));
    expect(back.build.routes.every((r) => !("join" in r))).toBe(true);
  });

  it("a saved join that no longer holds is cleared on load, so it never comes back under a later belt", () => {
    const bad = joined(K(4, 4));
    bad.routes.shift(); // the main belt is gone, the join was left behind
    const back = migrateRun(JSON.parse(JSON.stringify(withDeck(bad))))!;
    expect(back.build.routes).toEqual([{ factory: 2, cells: R }]);
  });
});
