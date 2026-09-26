// 0.6.2s TURRET SLOTS (REQ-BFG-031 S8): GhostSnapshot v2 carries build.turrets as an optional field in both
// src/net/snapshot.ts and src/game/ghostSnapshot.ts. The encoder writes it only when present (after the other build
// keys; entry keys slot, def, uid, stars?, free?), so old snapshots and builds without it encode byte-for-byte as
// before; a v1 snapshot can't carry it; bad shapes are refused on both sides; a run with turrets survives the save.
import { describe, expect, it } from "vitest";
import * as local from "../src/game/ghostSnapshot";
import * as net from "../src/net/snapshot";
import { ghostOf } from "../src/game/day";
import { migrateRun, newRun } from "../src/game/run";
import { startingBuild } from "../src/sim/ai";
import { RULES_VERSION } from "../src/sim/content";
import { startingTurrets, turretSlots, type Build, type BuildTurret } from "../src/sim/deck";
import { generateSamplePool } from "../tools/samplePool";

const POOL = generateSamplePool();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function netOk(s: unknown): boolean {
  try {
    net.checkSnapshot(s);
    return true;
  } catch {
    return false;
  }
}

/** The pre-turret canonical encoding, written out independently of the code: fixed key order, optional keys only
 *  when present, no `turrets`. */
function legacyText(s: net.GhostSnapshot): string {
  const b = s.build;
  const opt = (o: object, k: string) => {
    const v = (o as Record<string, unknown>)[k];
    return v !== undefined ? { [k]: v } : {};
  };
  return JSON.stringify({
    v: s.v, rules: s.rules, hero: s.hero, day: s.day, wins: s.wins, lives: s.lives,
    build: {
      hero: b.hero,
      items: b.items.map((p) => ({ uid: p.uid, def: p.def, x: p.x, y: p.y, ...opt(p, "stars"), ...opt(p, "rot") })),
      routes: b.routes.map((r) => ({ factory: r.factory, cells: [...r.cells] })),
      mods: b.mods.map((m) => ({ uid: m.uid, def: m.def, turret: m.turret, ...opt(m, "stars") })),
      beltCap: b.beltCap, hullBonus: b.hullBonus,
    },
    runId: s.runId, playerId: s.playerId, createdAt: s.createdAt,
  });
}

const TURRETS: BuildTurret[] = [...startingTurrets("furnace"), { slot: 1, def: "rampart", uid: 500, stars: 2 }];
const TURRETS_JSON = `[{"slot":0,"def":"scrapcannon","uid":90,"free":true},{"slot":1,"def":"rampart","uid":500,"stars":2}]`;

function snapWith(turrets: unknown, v: 1 | 2 = 2): net.GhostSnapshot {
  const build = { ...startingBuild("furnace", 1), turrets } as Build;
  return { v, rules: RULES_VERSION, hero: "furnace", day: 3, wins: 1, lives: 3, build, runId: "run-turrets", playerId: "player-t", createdAt: 1_790_000_000_000 };
}

describe("turret slots in snapshots: old snapshots are untouched", () => {
  it("every sample-pool snapshot (and its v1 copy where legal) encodes byte-for-byte as before and decodes identically", () => {
    expect(POOL).toHaveLength(40);
    let v1 = 0;
    for (const s of POOL) {
      const copies: net.GhostSnapshot[] = [s];
      if (netOk({ ...s, v: 1 })) copies.push({ ...s, v: 1 });
      for (const c of copies) {
        const text = net.encodeSnapshot(c);
        expect(text, `${c.hero} d${c.day} v${c.v}`).toBe(legacyText(c));
        expect(text).not.toContain("turrets");
        const back = net.decodeSnapshot(text);
        expect(back).toEqual(c);
        expect("turrets" in back.build).toBe(false);
        expect(local.isSnapshot(JSON.parse(text))).toBe(true);
        if (c.v === 1) v1++;
      }
    }
    expect(v1).toBeGreaterThan(0);
  });

  it("a starting deck without the field, and one whose field is undefined in memory, encode exactly as before", () => {
    const s: net.GhostSnapshot = { ...snapWith(undefined), build: startingBuild("weaver", 1), hero: "weaver" };
    expect(net.encodeSnapshot(s)).toBe(legacyText(s));
    expect(net.encodeSnapshot({ ...s, build: { ...s.build, turrets: undefined } })).toBe(legacyText(s));
    expect(local.isSnapshot({ ...s, build: { ...s.build, turrets: undefined } })).toBe(true);
    expect(net.checkBuildShape(startingBuild("furnace", 1))).toEqual(startingBuild("furnace", 1));
  });
});

describe("turret slots in snapshots: v2 carries build.turrets", () => {
  it("net: written last in the build, entries in canonical key order; the round trip keeps it", () => {
    const s = snapWith(TURRETS);
    const text = net.encodeSnapshot(s);
    expect(text).toBe(legacyText(s).replace(/"hullBonus":0\}/, `"hullBonus":0,"turrets":${TURRETS_JSON}}`));
    const back = net.decodeSnapshot(text);
    expect(back).toEqual(s);
    expect(net.encodeSnapshot(back)).toBe(text);
    // any input key order encodes canonically
    const shuffled = snapWith([{ free: true, uid: 90, def: "scrapcannon", slot: 0 }, { stars: 2, uid: 500, slot: 1, def: "rampart" }]);
    expect(net.encodeSnapshot(shuffled)).toBe(text);
    expect(net.encodeSnapshot(snapWith([]))).toContain(`"hullBonus":0,"turrets":[]}`);
    expect(net.ghostId(s)).not.toBe(net.ghostId(snapWith(undefined)));
  });

  it("local: isSnapshot takes the same snapshots; migrateSnapshot keeps the field", () => {
    const s = snapWith(TURRETS);
    expect(local.isSnapshot(s)).toBe(true);
    expect(local.isSnapshot(JSON.parse(net.encodeSnapshot(s)))).toBe(true);
    const g = local.migrateSnapshot(JSON.parse(net.encodeSnapshot(s)), "player-t");
    expect(g?.build.turrets).toEqual(TURRETS);
    expect(g && JSON.stringify(g)).toBe(net.encodeSnapshot(s));
  });

  it("a v1 snapshot with turrets is refused on both sides (even an empty list)", () => {
    for (const t of [TURRETS, []]) {
      const s = snapWith(t, 1);
      expect(() => net.checkSnapshot(s)).toThrow("snapshot.build.turrets: not allowed in a v1 snapshot");
      expect(() => net.decodeSnapshot(JSON.stringify(s))).toThrow(net.SnapshotError);
      expect(local.isSnapshot(s)).toBe(false);
    }
    expect(() => net.checkBuildShape({ ...startingBuild("furnace", 1), turrets: [] }, "build", 1)).toThrow("build.turrets: not allowed in a v1 snapshot");
  });

  it("bad shapes throw on the net side and fail isSnapshot on the local side; edge values pass on both", () => {
    const e = { slot: 1, def: "rampart", uid: 500 };
    const bad: [string, unknown][] = [
      ["not an array", { slot: 0 }], ["a string", "rampart"], ["null", null],
      ["9 entries", Array.from({ length: 9 }, (_, i) => ({ ...e, slot: i, uid: 500 + i }))],
      ["null entry", [null]], ["array entry", [[1, "rampart", 500]]], ["number entry", [5]],
      ["no slot", [{ def: "rampart", uid: 500 }]], ["no def", [{ slot: 1, uid: 500 }]], ["no uid", [{ slot: 1, def: "rampart" }]],
      ["slot -1", [{ ...e, slot: -1 }]], ["slot 16", [{ ...e, slot: 16 }]], ["slot 1.5", [{ ...e, slot: 1.5 }]], ["slot \"1\"", [{ ...e, slot: "1" }]],
      ["def upper case", [{ ...e, def: "RAMPART" }]], ["def empty", [{ ...e, def: "" }]], ["def number", [{ ...e, def: 7 }]],
      ["uid -1", [{ ...e, uid: -1 }]], ["uid 2^31", [{ ...e, uid: 2 ** 31 }]], ["uid null", [{ ...e, uid: null }]],
      ["stars 0", [{ ...e, stars: 0 }]], ["stars 4", [{ ...e, stars: 4 }]], ["stars 1.5", [{ ...e, stars: 1.5 }]], ["stars \"2\"", [{ ...e, stars: "2" }]],
      ["free false", [{ ...e, free: false }]], ["free 1", [{ ...e, free: 1 }]], ["free \"true\"", [{ ...e, free: "true" }]], ["free null", [{ ...e, free: null }]],
      ["unknown key rot", [{ ...e, rot: 1 }]], ["unknown key x", [{ ...e, x: 0 }]], ["unknown key turret", [{ ...e, turret: 1 }]],
    ];
    const mismatch: string[] = [];
    for (const [name, t] of bad) {
      const s = snapWith(t);
      if (netOk(s) || local.isSnapshot(s)) mismatch.push(`${name}: net ${netOk(s)}, local ${local.isSnapshot(s)}`);
      expect(() => net.checkSnapshot(s), name).toThrow(net.SnapshotError);
    }
    expect(mismatch).toEqual([]);
    const good: [string, unknown][] = [
      ["empty", []], ["slot 15", [{ ...e, slot: 15 }]], ["slot 0, uid 0", [{ ...e, slot: 0, uid: 0 }]], ["uid 2^31-1", [{ ...e, uid: 2 ** 31 - 1 }]],
      ["stars 1 (kept as given)", [{ ...e, stars: 1 }]], ["stars 3 and free", [{ ...e, stars: 3, free: true }]],
      ["8 entries", Array.from({ length: 8 }, (_, i) => ({ ...e, slot: i, uid: 500 + i }))],
    ];
    for (const [name, t] of good) {
      const s = snapWith(t);
      expect([netOk(s), local.isSnapshot(s)], name).toEqual([true, true]);
      expect(net.decodeSnapshot(net.encodeSnapshot(s)), name).toEqual(s);
    }
  });
});

describe("turret slots in the save and in ghosts", () => {
  it("a run with installed turrets and free cargo turrets round-trips through the save (v7, no bump)", () => {
    const run = newRun("furnace", 7, "turret-save");
    run.build.turrets = [{ slot: 0, def: "rampart", uid: 500, stars: 2 }, { slot: 1, def: "dartgun", uid: 501 }];
    run.inventory.push({ uid: 90, def: "scrapcannon", free: true }, { uid: 502, def: "swivel", stars: 2 });
    const back = migrateRun(clone(run))!;
    expect(back).toEqual(run);
    expect(back.build.turrets).toEqual(run.build.turrets);
    expect(back.inventory.find((i) => i.uid === 90)).toEqual({ uid: 90, def: "scrapcannon", free: true });
    expect(JSON.stringify(migrateRun(clone(back)))).toBe(JSON.stringify(run));
  });

  it("an old save (no field) loads with the starting turrets in place and the extra slot empty", () => {
    const run = newRun("weaver", 7, "old-save");
    const raw = clone(run);
    expect("turrets" in raw.build).toBe(false);
    const back = migrateRun(raw)!;
    expect(back).toEqual(run);
    expect("turrets" in back.build).toBe(false);
    expect(turretSlots(back.build).map((s) => (s.turret ? `${s.turret.def}:${s.turret.uid}:${s.turret.free}` : "empty")))
      .toEqual(["dartgun:90:true", "dartgun:91:true", "dartgun:92:true", "empty"]);
  });

  it("ghostOf carries the field; the ghost passes both snapshot checks", () => {
    const run = newRun("furnace", 9, "turret-ghost");
    run.build.turrets = clone(TURRETS);
    const g = ghostOf(run, 5, "p-turret");
    expect(local.isSnapshot(g)).toBe(true);
    expect(net.checkSnapshot(g)).toEqual(g);
    expect(g.build.turrets).toEqual(TURRETS);
    expect(net.decodeSnapshot(net.encodeSnapshot(g))).toEqual(g);
    const plain = ghostOf(newRun("furnace", 9, "plain-ghost"), 5, "p-plain");
    expect(net.encodeSnapshot(plain)).toBe(legacyText(plain));
  });
});
