import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JOIN_LIMIT, RULES_VERSION } from "../src/sim/content";
import { JOIN_NOT_NEXT, JOIN_OVER_LIMIT, key as K, type Build, type RouteDef } from "../src/sim/deck";
import { validateBuild, validateUpload } from "../src/net/validate";
import type { GhostSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";

// v070-rel M2 (a), REQ-BFG-027: the join limit in the player-upload check. A deck holds at most JOIN_LIMIT (2) joining
// belts (0.6.2 TUNE-M, RULE JOIN LIMIT). rel-062-final's validateBuild already refuses the next one in route order with
// deck.ts joinProblem's own reason, JOIN_OVER_LIMIT ("2 JOINS PER DECK"), among the route checks the player mode shares
// with the strict mode. So validateUpload adds no logic of its own; these tests pin the rule in both modes and at the
// server's POST /v1/ghosts.

// tests/joinlimit.test.ts's FURNACE deck: M = the KILN's belt up column 4 into the turret; R1..R3 = the belts of a STAMP
// PRESS, a DOUBLE STAMP and a SHOT TOWER joining M at (4,4), (4,3) and (4,2), in route order after M.
const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const R1: RouteDef = { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(3, 4)], join: K(4, 4) };
const R2: RouteDef = { factory: 3, cells: [K(7, 5), K(7, 4), K(7, 3), K(6, 3), K(5, 3)], join: K(4, 3) };
const R3: RouteDef = { factory: 4, cells: [K(2, 2), K(3, 2)], join: K(4, 2) };
/** R3 pointed at (4,3), a belt tile diagonal to its end: a join that is illegal by its shape (NOT NEXT TO ITS JOIN TILE). */
const R3_BAD: RouteDef = { ...R3, join: K(4, 3) };

function deck(routes: RouteDef[]): Build {
  return {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0, // 14 + four +4 belt crates
    items: [
      { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }, { uid: 3, def: "doublestamp", x: 7, y: 6 },
      { uid: 4, def: "shottower", x: 0, y: 2 },
    ],
    routes: [{ factory: 1, cells: [...M] }, ...routes.map((r) => ({ ...r, cells: [...r.cells] }))],
  };
}

const DAY = 5; // the deck costs 28 gold (20 in parts and 4 crates), within the strict budget from day 4
const modes = (b: Build) => [["strict", validateBuild(b, DAY)], ["player", validateUpload(b, DAY)]] as const;
const overLimit = (route: number, cell: number) => `route: route ${route} can't join cell ${cell}: ${JOIN_OVER_LIMIT}`;

describe("v070-rel M2 (a): at most JOIN_LIMIT joins per uploaded deck (validateBuild's own JOIN_OVER_LIMIT)", () => {
  it("2 joins, otherwise legal: both modes accept the deck", () => {
    expect(JOIN_LIMIT).toBe(2);
    expect(JOIN_OVER_LIMIT).toBe("2 JOINS PER DECK");
    for (const b of [deck([R1]), deck([R1, R2]), deck([R2, R3]), deck([R1, R3])]) {
      for (const [mode, v] of modes(b)) expect(v, `${mode}: ${b.routes.length - 1} joins`).toEqual({ ok: true, errors: [] });
    }
  });

  it("3 joins: both modes refuse the third in route order, with validateBuild's reason (2 JOINS PER DECK)", () => {
    const b = deck([R1, R2, R3]);
    for (const [mode, v] of modes(b)) {
      expect(v.ok, mode).toBe(false);
      expect(v.errors, mode).toContain(overLimit(3, K(4, 2)));
      expect(v.errors.filter((e) => e.includes(JOIN_OVER_LIMIT)), mode).toEqual([overLimit(3, K(4, 2))]); // only the third
    }
    expect(validateUpload(b, DAY).errors).toEqual(validateBuild(b, DAY).errors); // the strict mode's words, verbatim
    // route order decides which join is the third, not where it joins: R3 first keeps R3 and R1 and refuses R2
    const reordered = deck([R3, R1, R2]);
    for (const [mode, v] of modes(reordered)) expect(v.errors.filter((e) => e.includes(JOIN_OVER_LIMIT)), mode).toEqual([overLimit(3, K(4, 3))]);
  });

  it("a deck whose extra join has an illegal shape keeps its shape reason; that join never counts toward the limit", () => {
    // the third join is also past the limit, but joinProblem checks its shape first
    const third = deck([R1, R2, R3_BAD]);
    for (const [mode, v] of modes(third)) {
      expect(v.errors, mode).toContain(`route: route 3 can't join cell ${K(4, 3)}: ${JOIN_NOT_NEXT}`);
      expect(v.errors.some((e) => e.includes(JOIN_OVER_LIMIT)), mode).toBe(false);
    }
    // an illegal join first: R1 and R2 are still the deck's two legal joins
    const first = deck([R3_BAD, R1, R2]);
    for (const [mode, v] of modes(first)) {
      expect(v.errors.filter((e) => e.includes("can't join")), mode).toEqual([`route: route 1 can't join cell ${K(4, 3)}: ${JOIN_NOT_NEXT}`]);
    }
  });
});

let dir: string;
let app: GhostServer;
let base: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "bb-v070rel-joins-"));
  app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("v070-rel M2 (a) at the upload path", () => {
  it("POST /v1/ghosts stores a deck with 2 joins and refuses 3 with validateBuild's reason", async () => {
    const post = async (b: Build, who: string) => {
      const s: GhostSnapshot = { v: 2, rules: RULES_VERSION, hero: "furnace", day: DAY, wins: 0, lives: 3, build: b, runId: `joins-${who}`, playerId: `p-${who}`, createdAt: 1_790_000_000_000 };
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
      return { status: r.status, body: (await r.json()) as { id?: string; errors?: string[] } };
    };
    expect((await post(deck([R1, R2]), "two")).status).toBe(201);
    const three = await post(deck([R1, R2, R3]), "three");
    expect(three.status).toBe(422);
    expect(three.body.errors).toEqual(validateUpload(deck([R1, R2, R3]), DAY).errors);
    expect(three.body.errors).toContain(overLimit(3, K(4, 2)));
    expect(app.store.size).toBe(1);
  });
});
