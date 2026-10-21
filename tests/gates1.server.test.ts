// GATES-1 (REQ-BFG-052, REQ-BFG-057; BRIEF-GATES1 G6's server part, G3; step 4): the server pins. The same fixtures go through the
// client check (validateUpload, the player mode) and POST /v1/ghosts, in both switch states: the three gates (FUSER, SCATTER MILL,
// SMELTER) are accepted only with GATES on, under rules that have them (GATES_RULES), on a legal belt tile (splitProblem); they are
// refused with it off, under older rules, and when forged (off a belt, on a route's first or last tile, next to another gate, an
// unknown id, stars out of range, a rot, listed in the mods); the client's verdict is the server's every time, and when the server
// judges the deck it says the client's very errors. The server's data dir is under os.tmpdir().
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GRID, ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { cloneBuild, key, kx, ky, occupancy, type Build, type Placed } from "../src/sim/deck";
import { GATES, GATES_DEFS, GATES_IDS, setGates, withGates } from "../src/sim/gates";
import { SPLIT_NO_BELT, SPLIT_OFF_BELT, beltTile, splitProblem } from "../src/sim/split";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { validateUpload } from "../src/net/validate";
import { GATES_RULES, longRunFor } from "../src/net/rulesGate";
import { reachableRecords } from "../src/net/records";
import { SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

afterEach(() => setGates(GATES)); // the shipped value (off)

/** One fixture. `ok`: the client's verdict with GATES on, under this build's rules. `on`, `off`: a piece of the first error of a
 *  refused one with the switch on and off (`off` absent: the rules gate's, which every deck holding a gate in its items gets;
 *  false: not pinned, the deck holds no gate in its items, so another error may come first). */
type Fx = { name: string; s: GhostSnapshot; ok: boolean; on?: string; off?: string | false };
const GATE_OFF = "rules: gates (FUSER, SCATTER MILL, SMELTER): not in this rules version yet";
const THREE = ["fuser", "scattermill", "smelter"];

/** `b` without its rigs and gates, to free the gold. */
function strip(b: Build): Build {
  const nb = cloneBuild(b);
  nb.items = nb.items.filter((p) => !["gate", "converter"].includes(ITEMS[p.def].kind));
  return nb;
}

/** The first tile (route order, then tile order) of `b` where a gate may stand (splitProblem says null; its rule is the same for
 *  the three), or null. */
function spot(b: Build): { ri: number; t: number } | null {
  for (let ri = 0; ri < b.routes.length; ri++) for (let t = 0; t < b.routes[ri].cells.length; t++) if (splitProblem(b, "fuser", b.routes[ri].cells[t]) === null) return { ri, t };
  return null;
}

/** `b` with `defs` on the first legal tiles, placed one after the other (so none stands next to another), or null. */
function gated(b: Build, defs: string[], uid0: number): Build | null {
  const nb = cloneBuild(b);
  for (const [i, def] of defs.entries()) {
    const at = spot(nb);
    if (!at) return null;
    const k = nb.routes[at.ri].cells[at.t];
    nb.items.push({ uid: uid0 + i, def, x: kx(k), y: ky(k) });
  }
  return nb;
}

/** The first par deck (WEAVER, FURNACE, FOUNDRY, BASTION; seeds 1-12) at `day` with room for all three gates, the first on a
 *  belt of 4+ tiles, with every rig taken off (a par deck's rigs hold far more gold than three gates). */
function parDeck(day: number): { hero: HeroId; seed: number; base: Build } {
  for (const hero of ["weaver", "furnace", "foundry", "bastion"] as HeroId[]) for (let seed = 1; seed <= 12; seed++) {
    const base = strip(playerRun(hero, day, seed)[day - 1].build);
    const at = spot(base);
    if (at && base.routes[at.ri].cells.length >= 4 && gated(base, THREE, 901)) return { hero, seed, base };
  }
  throw new Error("no par deck has room for three gates");
}

/** The fixtures both checks judge: a day-10 par deck (made with GATES on) with the three gates placed by hand on legal tiles of
 *  its belts, or forged. `ok` is the verdict with GATES on. The old-rules fixture is a day-1 deck (8 G is all it holds) with a
 *  SCATTER MILL, under bb-0.9.7: a record from before the three. */
function fixtures(): Fx[] {
  const day = 10;
  const rec = reachableRecords(day).find((r) => r.wins === day - 1) ?? reachableRecords(day)[0];
  return withGates(() => {
    const { hero, seed, base } = parDeck(day);
    const snap = (name: string, build: Build, o: { rules?: string; day?: number; wins?: number; lives?: number } = {}): GhostSnapshot => {
      const rules = o.rules ?? RULES_VERSION, d = o.day ?? day, wins = o.wins ?? rec.wins;
      return {
        v: SNAPSHOT_V3, rules, hero, day: d, wins, lives: o.lives ?? rec.lives, build, runId: `gates1-${name}`,
        playerId: "p-gates1", createdAt: 1_790_000_000_000, seed: parRunSeed(hero, seed),
        // a long run's upload states the dusks it lost (day - 1 = wins + losses + draws); these records have no loss and no draw
        ...(longRunFor(rules) ? { losses: d - 1 - wins } : {}),
      };
    };
    // the belt the first gate stands on (cells[t] is its first legal tile), and a free cell off every belt (row 0 holds the intakes)
    const { ri, t } = spot(base)!;
    const cells = base.routes[ri].cells;
    const occ = occupancy(base);
    const free = [...Array(GRID * GRID).keys()].find((k) => ky(k) > 0 && occ[k].item < 0 && occ[k].route < 0)!;
    const piece = (def: string, k: number, uid: number, more: Partial<Placed> = {}): Placed => ({ uid, def, x: kx(k), y: ky(k), ...more });
    const plus = (...items: Placed[]): Build => { const nb = cloneBuild(base); nb.items.push(...items); return nb; };
    const bad = (p: Placed, why: string): string => `placement: uid ${p.uid} ${GATES_DEFS[p.def].name} at ${p.x},${p.y}: ${why}`;
    const out: Fx[] = [];
    out.push({ name: "fuser-scatter-smelter", s: snap("three", gated(base, THREE, 901)!), ok: true });
    // (value = price x 2^(stars - 1): a ★3 FUSER is 24 G; the stripped rigs leave far more than that)
    out.push({ name: "fuser-star3", s: snap("star3", plus(piece("fuser", cells[t], 911, { stars: 3 }))), ok: true });
    // refused either way: forged
    const off = piece("fuser", free, 921), first = piece("fuser", cells[0], 922), last = piece("fuser", cells[cells.length - 1], 923);
    const left = piece("fuser", cells[t], 924), right = piece("smelter", cells[t + 1], 925);
    out.push({ name: "off-belt", s: snap("offbelt", plus(off)), ok: false, on: bad(off, SPLIT_OFF_BELT) });
    out.push({ name: "first-tile", s: snap("first", plus(first)), ok: false, on: bad(first, SPLIT_NO_BELT) });
    out.push({ name: "last-tile", s: snap("last", plus(last)), ok: false, on: bad(last, SPLIT_NO_BELT) });
    out.push({ name: "next-to-gate", s: snap("pair", plus(left, right)), ok: false, on: bad(left, SPLIT_NO_BELT) });
    // an unknown id is unknown with the switch either way; a gate in the mods is no gate for the rules gate (it reads the items),
    // so with the switch off neither deck gets its text; stars 4 is the strict decoder's (the server answers 400, the client's
    // check a shape error)
    out.push({ name: "unknown-id", s: snap("unknown", plus(piece("fuserx", cells[t], 926))), ok: false, on: 'item: uid 926 is unknown item "fuserx"', off: false });
    out.push({ name: "stars-out-of-range", s: snap("stars4", plus(piece("fuser", cells[t], 927, { stars: 4 }))), ok: false, on: `shape: build.items[${base.items.length}].stars` });
    out.push({ name: "rot-on-gate", s: snap("rot", plus(piece("fuser", cells[t], 928, { rot: 1 }))), ok: false, on: "item: uid 928 FUSER can't have a rot (only rigs turn)" });
    const mods = cloneBuild(base);
    mods.mods.push({ uid: 929, def: "fuser", turret: 0 });
    out.push({ name: "in-mods", s: snap("mods", mods), ok: false, on: "hardpoint: uid 929 FUSER is not turret equipment", off: false });
    // a record from before the three: a day-1 deck holding a SCATTER MILL under bb-0.9.7 (day 1, no wins, 5 lives, the old rules' own record)
    const d1 = gated(strip(playerRun(hero, 1, seed)[0].build), ["scattermill"], 931);
    expect(d1, "a legal tile on the day-1 deck").not.toBeNull();
    out.push({ name: "old-rules", s: snap("old", d1!, { rules: "bb-0.9.7", day: 1, wins: 0, lives: 5 }), ok: false, on: `rules: rules bb-0.9.7 predate ${GATES_RULES}: gates (FUSER, SCATTER MILL, SMELTER) need ${GATES_RULES} or later` });
    return out;
  });
}

const rulesRank = (r: string): number => r.split(".").slice(1).map(Number).reduce((a, n) => a * 1000 + n, 0); // BUMP-1G: bb-0.<minor>.<patch> as a number
describe("GATES-1: the client check and POST /v1/ghosts agree on the three gates, in both switch states", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-gates1-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("GATES_RULES: the literal of this rules version; the fixtures hold each of the three, the first on three belt tiles, none next to another", () => {
    expect(GATES_RULES).toBe("bb-0.13.0"); // BUMP-1G (BRIEF-BUMP1G P2: every other rules literal stays): was expect(GATES_RULES).toBe(RULES_VERSION); GATES went live at bb-0.13.0 and its gate keeps that literal; RULES_VERSION is bb-0.14.0 now
    expect(rulesRank(GATES_RULES)).toBeLessThanOrEqual(rulesRank(RULES_VERSION));
    const fx = fixtures();
    const held = new Set(fx.flatMap((f) => f.s.build.items.map((p) => p.def)).filter((d) => GATES_IDS.includes(d)));
    expect([...held].sort()).toEqual([...THREE].sort());
    expect(fx.map((f) => f.name)).toEqual(["fuser-scatter-smelter", "fuser-star3", "off-belt", "first-tile", "last-tile", "next-to-gate", "unknown-id", "stars-out-of-range", "rot-on-gate", "in-mods", "old-rules"]);
    const b = fx[0].s.build;
    const at = b.items.filter((p) => GATES_IDS.includes(p.def)).map((p) => beltTile(b, key(p.x, p.y)));
    expect(at.length).toBe(3);
    expect(at.every((a) => a !== null), "each gate stands on a belt tile").toBe(true);
    const tiles = at as [number, number][]; // [route, tile]
    for (const [i, a] of tiles.entries()) for (const c of tiles.slice(i + 1)) if (a[0] === c[0]) expect(Math.abs(a[1] - c[1]), "two gates of one belt").toBeGreaterThanOrEqual(2);
  });

  it("each fixture: the client's verdict is the server's, GATES on (as listed) and off (every one refused)", async () => {
    const fx = fixtures();
    const me = await testIdentity(0);
    const rows: string[] = [];
    for (const on of [true, false]) {
      setGates(on);
      for (const f of fx) {
        const body = JSON.stringify({ ...ownedBy(f.s, me), runId: `${f.s.runId}-${on ? "on" : "off"}` });
        const s = JSON.parse(body) as GhostSnapshot; // the client judges exactly the bytes the server gets
        const client = validateUpload(s.build, s.day, s.rules, { seed: s.seed });
        const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
        const text = await r.text();
        rows.push(`${on ? "on " : "off"} ${f.name}: client ${client.ok ? "ok" : client.errors[0]} | server ${r.status} ${r.status === 201 ? "" : text.slice(0, 140)}`);
        expect(r.status === 201, `${f.name} ${on ? "on" : "off"}: server ${r.status} ${text.slice(0, 300)} vs client ${JSON.stringify(client.errors)}`).toBe(client.ok);
        // the client's verdict: the listed one with GATES on and these rules; every fixture refused with it off (the fixtures
        // hold pieces the switch-off game doesn't have)
        expect(client.ok, `${f.name} ${on ? "on" : "off"}: ${JSON.stringify(client.errors)}`).toBe(on && f.ok);
        // when the server judged the deck (a 422 with its errors) it says the client's very errors
        const errors = r.status === 422 ? (JSON.parse(text) as { errors?: string[] }).errors : undefined;
        if (errors) expect(errors, `${f.name} ${on ? "on" : "off"}: the server's errors`).toEqual(client.errors);
        // the first error of a refused fixture: the forged one's own reason with it on, the rules gate's (or its own) with it off
        const want = on ? f.on : f.off === undefined ? GATE_OFF : f.off;
        if (!client.ok && want) expect(client.errors[0], `${f.name} ${on ? "on" : "off"}`).toContain(want);
      }
    }
    setGates(GATES);
    for (const r of rows) console.log(`GATES PIN ${r}`);
    // the three off: a record naming a piece this version doesn't have; older rules, with them on, name both versions
    expect(rows.filter((r) => r.startsWith("off") && r.includes("fuser-scatter-smelter"))[0]).toContain(GATE_OFF);
    expect(rows.filter((r) => r.startsWith("on ") && r.includes("old-rules"))[0]).toContain(`predate ${GATES_RULES}`);
  }, 300_000);
});
