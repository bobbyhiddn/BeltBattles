// SHAPES-2 (REQ-BFG-114 (4); BRIEF-SHAPES2 S4; step 5): the server pins. The same fixtures go through the client check (validateUpload,
// the player mode) and POST /v1/ghosts, in both switch states: the six are accepted only with SHAPES2 on and under rules that have
// them (SHAPES2_RULES), refused with it off and under older rules; an overlap, a cell off the deck and a shaped piece on a TURRET
// INTAKE cell are refused either way; the client's verdict is the server's every time. The server's data dir is under os.tmpdir().
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GRID, ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { canPlaceItem, cloneBuild, isIntakeCell, type Build } from "../src/sim/deck";
import { footprintCells } from "../src/sim/foot";
import { SHAPES2, SHAPES2_IDS, setShapes2, withShapes2 } from "../src/sim/shapes2";
import { withShapes } from "../src/sim/shapes";
import { withPlainRigs, setPlainRigs, PLAIN_RIGS } from "../src/sim/plainRigs";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { validateUpload } from "../src/net/validate";
import { SHAPES2_RULES, longRunFor, rulesAtLeast } from "../src/net/rulesGate"; // BUMP-1E: + rulesAtLeast (this build's rules are at or after SHAPES2_RULES)
import { reachableRecords } from "../src/net/records";
import { SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

afterEach(() => { setShapes2(SHAPES2); setPlainRigs(PLAIN_RIGS); }); // the shipped values (BUMP-1D: both on; the PLAIN_RIGS one was false)

/** The first spot (row order, rot as listed) where `def` fits on `b`, not on an intake cell, or null. */
function spotFor(b: Build, def: string, rots = [0, 1, 2, 3]): { x: number; y: number; rot: number } | null {
  for (const rot of rots) for (let y = 1; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (!canPlaceItem(b, def, x, y, -1, rot).ok) continue;
    if (footprintCells(ITEMS[def], x, y, rot).some((k) => isIntakeCell(b, k))) continue;
    return { x, y, rot };
  }
  return null;
}

/** The fixtures both checks judge: a day-10 WEAVER par deck (made with both switches on) with every rig taken off, to free the gold,
 *  then the six placed; the first par seed (1-12) with a free 2x2 over a turret intake cell gives the intake fixture. `ok` is the
 *  verdict with SHAPES2 on, under this build's rules. The old-rules fixture is a day-1 deck (8 G is all it holds) with an ELBOW GUARD,
 *  under bb-0.9.7: a record from before the six. */
function fixtures(): { name: string; s: GhostSnapshot; ok: boolean }[] {
  const hero: HeroId = "weaver", day = 10;
  const rec = reachableRecords(day).find((r) => r.wins === day - 1) ?? reachableRecords(day)[0];
  return withPlainRigs(() => withShapes2(() => {
    const strip = (b: Build): Build => { const nb = cloneBuild(b); nb.items = nb.items.filter((p) => ITEMS[p.def].kind !== "gate"); return nb; };
    const seed = 1;
    const base = strip(playerRun(hero, day, seed)[day - 1].build);
    const snap = (name: string, build: Build, o: { rules?: string; day?: number; wins?: number; lives?: number; seed?: number } = {}): GhostSnapshot => {
      const rules = o.rules ?? RULES_VERSION, d = o.day ?? day, wins = o.wins ?? rec.wins;
      return {
        v: SNAPSHOT_V3, rules, hero, day: d, wins, lives: o.lives ?? rec.lives, build, runId: `shapes2-${name}`,
        playerId: "p-shapes2", createdAt: 1_790_000_000_000, seed: o.seed ?? parRunSeed(hero, seed),
        // BUMP-1D (RUN-1, rules bb-0.11.0): a long run's upload states the dusks it lost (the server answers 422 without `losses`:
        // day - 1 = wins + losses + draws). These records have no loss and no draw (wins = day - 1), so none; a record under older
        // rules has no such field (the decoder refuses it there)
        ...(longRunFor(rules) ? { losses: d - 1 - wins } : {}),
      };
    };
    const add = (b: Build, defs: string[], uid0: number): Build => {
      const nb = cloneBuild(b);
      defs.forEach((def, i) => {
        const sp = spotFor(nb, def)!;
        expect(sp, `a spot for ${def}`).not.toBeNull();
        nb.items.push({ uid: uid0 + i, def, x: sp.x, y: sp.y, ...(sp.rot ? { rot: sp.rot } : {}) });
      });
      return nb;
    };
    const out: { name: string; s: GhostSnapshot; ok: boolean }[] = [];
    out.push({ name: "elbow-saw-comb", s: snap("lines", add(base, ["elbowguard", "sawbar", "sparkcomb"], 801)), ok: true });
    const wide = add(base, ["cinderhook", "jawcrusher"], 811);
    out.push({ name: "hook-jaw", s: snap("wide", wide), ok: true });
    const pick = add(base, ["pickaxe"], 821);
    out.push({ name: "pickaxe", s: snap("pick", pick), ok: true });
    // refused either way: an overlap, a cell off the deck
    const p1 = wide.items.find((p) => p.uid === 811)!;
    out.push({ name: "overlap", s: snap("overlap", { ...cloneBuild(wide), items: wide.items.map((p) => (p.uid === 812 ? { uid: 812, def: "jawcrusher", x: p1.x, y: p1.y } : p)) }), ok: false });
    out.push({ name: "offdeck", s: snap("offdeck", { ...cloneBuild(pick), items: pick.items.map((p) => (p.uid === 821 ? { uid: 821, def: "pickaxe", x: GRID - 2, y: 3 } : p)) }), ok: false });
    // a shaped piece on a turret intake cell: SPARK COMB (an I2, so its cells stay in row 0) on two free cells of row 0 with an intake
    // among them (a 1-cell rig may stand on an intake, 0.9.9's rule, so canPlaceItem with WHETSTONE says whether a cell is free; the
    // cells under an intake are the belts', so a 2x2 would overlap them)
    for (const q of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const b = strip(playerRun(hero, day, q)[day - 1].build);
      // (with SHAPES on canPlaceItem refuses every piece on an intake cell, TURRET INTAKE, so the free cells are read with it off)
      const k = withShapes(() => [...Array(GRID - 1).keys()].find((x) => (isIntakeCell(b, x) || isIntakeCell(b, x + 1)) && canPlaceItem(b, "whetstone", x, 0).ok && canPlaceItem(b, "whetstone", x + 1, 0).ok), false);
      if (k === undefined) continue;
      out.push({ name: "intake", s: snap("intake", { ...cloneBuild(b), items: [...b.items, { uid: 831, def: "sparkcomb", x: k, y: 0 }] }, { seed: parRunSeed(hero, q) }), ok: false });
      break;
    }
    // a record from before the six: a day-1 deck holding an ELBOW GUARD under bb-0.9.7 (day 1, no wins, 5 lives, the old rules' own record)
    const d1 = strip(playerRun(hero, 1, seed)[0].build);
    out.push({ name: "elbow-day1-old-rules", s: snap("old", add(d1, ["elbowguard"], 841), { rules: "bb-0.9.7", day: 1, wins: 0, lives: 5, seed: parRunSeed(hero, seed) }), ok: false });
    return out;
  }));
}

describe("SHAPES-2 S4: the client check and POST /v1/ghosts agree on the six, in both switch states", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-shapes2-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("SHAPES2_RULES: the literal of the rules version that brought the six (this build's rules carry them); the fixtures hold each of the six", () => {
    // BUMP-1E: was expect(SHAPES2_RULES).toBe(RULES_VERSION) (both bb-0.11.0). SHAPES2_RULES is a literal gate (the rules that brought the six) and stays
    // bb-0.11.0; this build's rules are bb-0.12.0 (content.ts RULES_VERSION), the version after it, so the fixtures (stated under this build's rules) have the six
    expect(SHAPES2_RULES).toBe("bb-0.11.0");
    expect(RULES_VERSION).toBe("bb-0.14.0"); // BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): was bb-0.12.0 (SHAPES2_RULES stays the literal bb-0.11.0)
    expect(SHAPES2_RULES).not.toBe(RULES_VERSION);
    expect(rulesAtLeast(RULES_VERSION, SHAPES2_RULES)).toBe(true);
    const fx = fixtures();
    const held = new Set(fx.flatMap((f) => f.s.build.items.map((p) => p.def)).filter((d) => SHAPES2_IDS.includes(d)));
    expect([...held].sort()).toEqual([...SHAPES2_IDS].sort());
    expect(fx.map((f) => f.name)).toEqual(["elbow-saw-comb", "hook-jaw", "pickaxe", "overlap", "offdeck", "intake", "elbow-day1-old-rules"]);
  });

  it("each fixture: the client's verdict is the server's, SHAPES2 on (as listed) and off (every one refused)", async () => {
    const fx = fixtures();
    const me = await testIdentity(0);
    const rows: string[] = [];
    for (const on of [true, false]) {
      setPlainRigs(on); // 1D ships both; the six also work with PLAIN_RIGS off (tests/shapes2.pieces)
      setShapes2(on);
      for (const f of fx) {
        const body = JSON.stringify({ ...ownedBy(f.s, me), runId: `${f.s.runId}-${on ? "on" : "off"}` });
        const s = JSON.parse(body) as GhostSnapshot; // the client judges exactly the bytes the server gets
        const client = validateUpload(s.build, s.day, s.rules, { seed: s.seed });
        const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
        const text = await r.text();
        rows.push(`${on ? "on " : "off"} ${f.name}: client ${client.ok ? "ok" : client.errors[0]} | server ${r.status} ${r.status === 201 ? "" : text.slice(0, 140)}`);
        expect(r.status === 201, `${f.name} ${on ? "on" : "off"}: server ${r.status} ${text.slice(0, 300)} vs client ${JSON.stringify(client.errors)}`).toBe(client.ok);
        // the client's verdict: the listed one with SHAPES2 on and these rules; every fixture refused with it off
        // (the fixtures hold pieces the switch-off game doesn't have)
        expect(client.ok, `${f.name} ${on ? "on" : "off"}: ${JSON.stringify(client.errors)}`).toBe(on && f.ok);
      }
    }
    setShapes2(SHAPES2);
    setPlainRigs(PLAIN_RIGS); // BUMP-1D: the shipped value (on; it was put back off while PLAIN_RIGS shipped off)
    for (const r of rows) console.log(`S4 PIN ${r}`);
    // the six off: the first error of every refused fixture is the gate's (a record naming a piece this version doesn't have)
    expect(rows.filter((r) => r.startsWith("off") && r.includes("elbow-saw-comb"))[0]).toContain("rules: shaped rigs (ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER, PICKAXE): not in this rules version yet");
    expect(rows.filter((r) => r.startsWith("on ") && r.includes("elbow-day1-old-rules"))[0]).toContain(`predate ${SHAPES2_RULES}`);
    expect(rows.filter((r) => r.startsWith("on ") && r.includes("intake"))[0]).toContain("TURRET INTAKE");
  }, 300_000);
});
