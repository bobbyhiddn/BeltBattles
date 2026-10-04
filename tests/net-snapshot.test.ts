import { describe, expect, it } from "vitest";
import { warlordBuild } from "../src/sim/ai";
import type { HeroId } from "../src/sim/content";
import {
  decodeSnapshot, encodeSnapshot, ghostId, MAX_SNAPSHOT_BYTES, SnapshotError, type GhostSnapshot,
} from "../src/net/snapshot";
import { snap } from "./netHelpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

describe("ghost snapshot format", () => {
  it("survives an encode/decode round trip, byte for byte", () => {
    const s = snap({ day: 4, wins: 2, lives: 2 });
    const text = encodeSnapshot(s);
    expect(decodeSnapshot(text)).toEqual(s);
    expect(encodeSnapshot(decodeSnapshot(text))).toBe(text);
    expect(text).not.toMatch(/\s/);
  });

  it("round-trips every warlord deck for both heroes on days 1-10", () => {
    for (const hero of ["furnace", "weaver"] as HeroId[]) {
      for (let day = 1; day <= 10; day++) {
        // 0.6.2 BELTSIDE: a warlord's rigs carry `rot`, so its deck travels in v2 (D1)
        const s = snap({ v: 2, hero, day, build: warlordBuild(hero, day) }, hero);
        expect(decodeSnapshot(encodeSnapshot(s))).toEqual(s);
      }
    }
  });

  it("is canonical: key order and whitespace do not change the encoding or the id", () => {
    const s = snap({ day: 2, wins: 1 });
    const b = s.build;
    const messy = JSON.stringify({
      createdAt: s.createdAt, playerId: s.playerId, runId: s.runId,
      build: {
        hullBonus: b.hullBonus, beltCap: b.beltCap, mods: b.mods,
        routes: b.routes.map((r) => ({ cells: r.cells, factory: r.factory })),
        items: b.items.map((p) => ({ y: p.y, x: p.x, def: p.def, uid: p.uid })), hero: b.hero,
      },
      lives: s.lives, wins: s.wins, day: s.day, hero: s.hero, rules: s.rules, v: 1,
    }, null, 2);
    expect(encodeSnapshot(decodeSnapshot(messy))).toBe(encodeSnapshot(s));
    expect(ghostId(decodeSnapshot(messy))).toBe(ghostId(s));
  });

  it("gives content-addressed ids", () => {
    const s = snap();
    expect(ghostId(s)).toMatch(/^g[0-9a-f]{14}$/);
    expect(ghostId(snap())).toBe(ghostId(s));
    expect(ghostId(snap({ createdAt: s.createdAt + 1 }))).not.toBe(ghostId(s));
  });

  it("rejects unknown fields, wrong types and out-of-range values", () => {
    const good = JSON.parse(encodeSnapshot(snap({ day: 3, wins: 1 })));
    const cases: [string, (o: Loose) => void][] = [
      ["unknown top-level field", (o) => { o.extra = 1; }],
      ["unknown build field", (o) => { o.build.cheat = true; }],
      ["unknown item field", (o) => { o.build.items[0].spin = 1; }],
      ["rot in a v1 snapshot", (o) => { o.build.items[0].rot = 1; }], // 0.6.2 BELTSIDE: rot is v2 only
      ["rot out of range", (o) => { o.v = 2; o.build.items[0].rot = 4; }],
      ["rot on a mod", (o) => { o.v = 2; o.build.mods = [{ uid: 9, def: "chamber", turret: 0, rot: 1 }]; }],
      ["unknown route field", (o) => { o.build.routes[0].speed = 3; }],
      ["missing field", (o) => { delete o.playerId; }],
      ["missing build field", (o) => { delete o.build.mods; }],
      ["wrong format version", (o) => { o.v = 4; }], // RUNES-1: v 3 is current (snapshot v3), v 1 and v 2 still decode
      ["day as a string", (o) => { o.day = "3"; }],
      ["day 0", (o) => { o.day = 0; o.wins = 0; }],
      ["day 11", (o) => { o.day = 11; }],
      ["fractional wins", (o) => { o.wins = 0.5; }],
      ["wins beyond day - 1", (o) => { o.wins = 3; }],
      ["no lives left", (o) => { o.lives = 0; }],
      ["unknown hero", (o) => { o.hero = "lich"; o.build.hero = "lich"; }],
      ["build hero differs", (o) => { o.build.hero = "weaver"; }],
      ["route cell off the grid", (o) => { o.build.routes[0].cells[0] = 100; }],
      ["item x off the grid", (o) => { o.build.items[0].x = 10; }],
      ["item y as a string", (o) => { o.build.items[0].y = "6"; }],
      ["items not an array", (o) => { o.build.items = {}; }],
      ["null build", (o) => { o.build = null; }],
      ["e-mail as player id", (o) => { o.playerId = "bob@example.com"; }],
      ["empty run id", (o) => { o.runId = ""; }],
      ["fractional createdAt", (o) => { o.createdAt = 1.5; }],
      ["rules with spaces", (o) => { o.rules = "bb 0.4.0"; }],
      ["def with capitals", (o) => { o.build.items[0].def = "KILN"; }],
    ];
    for (const [name, mutate] of cases) {
      const o = structuredClone(good);
      mutate(o);
      expect(() => decodeSnapshot(JSON.stringify(o)), name).toThrow(SnapshotError);
    }
    expect(() => decodeSnapshot("not json")).toThrow(SnapshotError);
    expect(() => decodeSnapshot("[]")).toThrow(SnapshotError);
    expect(() => decodeSnapshot("null")).toThrow(SnapshotError);
    expect(() => decodeSnapshot(`{"__proto__":{"v":1},${JSON.stringify(good).slice(1)}`)).toThrow(SnapshotError);
    expect(() => encodeSnapshot({ ...snap(), extra: 1 } as GhostSnapshot)).toThrow(SnapshotError);
  });

  it("caps the encoded size at 16 KB", () => {
    const text = encodeSnapshot(snap());
    expect(MAX_SNAPSHOT_BYTES).toBe(16384);
    const padded = text.replace("{", "{" + " ".repeat(MAX_SNAPSHOT_BYTES));
    expect(() => JSON.parse(padded)).not.toThrow();
    expect(() => decodeSnapshot(padded)).toThrow(/16384 bytes/);
    const huge = JSON.stringify({ ...JSON.parse(text), runId: "x".repeat(20000) });
    expect(() => decodeSnapshot(huge)).toThrow(SnapshotError);
  });
});
