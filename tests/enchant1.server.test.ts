// ENCHANT-1 (REQ-BFG-085 (4); BRIEF-ENCHANT1 E2; step 2): the server pin. The same fixtures go through the client check
// (validateUpload, the player mode) and POST /v1/ghosts, in both switch states: a word on a piece that can take it is accepted only
// with ENCHANT on and under rules that have it (ENCHANT_RULES), refused with it off and under older rules; a word on a kind that can't
// take it, a taken WIDE side, a stray enchDir or `grow`, and a word on gear are refused either way; the client's verdict is the
// server's every time. The server's data dir is under os.tmpdir(). Run 2 (E6) tightens what the accepted fixtures must also be
// (offered, counted, paid for): this file then gives them the seed's words.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { cloneBuild, setTurretList, turretList, type Build } from "../src/sim/deck";
import { ENCHANT, enchantProblem, freeSides, setEnchant } from "../src/sim/enchant";
import { SHAPE_ARROWS, rigShape } from "../src/sim/content";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { validateUpload } from "../src/net/validate";
import { ENCHANT_RULES, longRunFor } from "../src/net/rulesGate";
import { reachableRecords } from "../src/net/records";
import { SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

afterEach(() => setEnchant(ENCHANT)); // the shipped value (off)

/** The fixtures both checks judge: a day-10 WEAVER par deck (made with ENCHANT off: no words) with a word put on pieces it already
 *  holds (no purchase, so the gold is the par deck's own); `ok` is the verdict with ENCHANT on, under this build's rules. */
function fixtures(): { name: string; s: GhostSnapshot; ok: boolean }[] {
  const hero: HeroId = "weaver", day = 10, seed = 1;
  const rec = reachableRecords(day).find((r) => r.wins === day - 1) ?? reachableRecords(day)[0];
  const par = playerRun(hero, day, seed)[day - 1].build;
  const snap = (name: string, build: Build, o: { rules?: string; day?: number; wins?: number; lives?: number } = {}): GhostSnapshot => {
    const rules = o.rules ?? RULES_VERSION, d = o.day ?? day, wins = o.wins ?? rec.wins;
    return {
      v: SNAPSHOT_V3, rules, hero, day: d, wins, lives: o.lives ?? rec.lives, build, runId: `enchant1-${name}`, playerId: "p-enchant1", createdAt: 1_790_000_000_000,
      seed: parRunSeed(hero, seed), ...(longRunFor(rules) ? { losses: d - 1 - wins } : {}),
    };
  };
  const rigs = par.items.filter((p) => ITEMS[p.def].kind === "gate");
  const wideRig = rigs.find((p) => enchantProblem(ITEMS[p.def], "wide") === null);
  const factory = par.items.find((p) => ITEMS[p.def].kind === "factory")!;
  expect(rigs.length, "the par deck holds rigs").toBeGreaterThan(0);
  expect(wideRig, "a rig WIDE can go on").toBeTruthy();
  const put = (uid: number, f: Record<string, unknown>): Build => ({ ...cloneBuild(par), items: par.items.map((p) => (p.uid === uid ? { ...p, ...f } : p)) });
  const turretWith = (f: Record<string, unknown>): Build => {
    const nb = cloneBuild(par);
    const list = turretList(nb);
    setTurretList(nb, list.map((t, i) => (i === 0 ? { ...t, ...f } : t)));
    return nb;
  };
  const out: { name: string; s: GhostSnapshot; ok: boolean }[] = [];
  out.push({ name: "rig-fiery", s: snap("rig-fiery", put(rigs[0].uid, { ench: "fiery" })), ok: true });
  const side = freeSides(ITEMS[wideRig!.def])[0];
  out.push({ name: "rig-wide", s: snap("rig-wide", put(wideRig!.uid, { ench: "wide", enchDir: side })), ok: true });
  out.push({ name: "factory-massive", s: snap("factory-massive", put(factory.uid, { ench: "massive" })), ok: true });
  out.push({ name: "turret-braced", s: snap("turret-braced", turretWith({ ench: "braced" })), ok: true });
  out.push({ name: "rig-growing", s: snap("rig-growing", put(rigs[0].uid, { ench: "growing", grow: 1 })), ok: true });
  // refused either way
  out.push({ name: "rig-massive", s: snap("rig-massive", put(rigs[0].uid, { ench: "massive" })), ok: false });
  const shape = rigShape(ITEMS[wideRig!.def])!;
  out.push({ name: "wide-taken-side", s: snap("wide-taken-side", put(wideRig!.uid, { ench: "wide", enchDir: SHAPE_ARROWS[shape][0] })), ok: false });
  out.push({ name: "grow-on-fiery", s: snap("grow-on-fiery", put(rigs[0].uid, { ench: "fiery", grow: 1 })), ok: false });
  out.push({ name: "enchDir-on-fiery", s: snap("enchDir-on-fiery", put(rigs[0].uid, { ench: "fiery", enchDir: 1 })), ok: false });
  out.push({ name: "unknown-word", s: snap("unknown-word", put(rigs[0].uid, { ench: "keen" })), ok: false });
  const withGear = cloneBuild(par);
  if (withGear.mods.length) {
    withGear.mods = withGear.mods.map((m, i) => (i === 0 ? { ...m, ench: "fiery" } : m));
    out.push({ name: "gear-fiery", s: snap("gear-fiery", withGear), ok: false });
  }
  // a record from before the words: a day-1 deck holding a word under bb-0.9.7 (day 1, no wins, 5 lives, the old rules' own record)
  // (without its rigs: a shaped rig's own gate, bb-0.10.0, would speak first under bb-0.9.7)
  const d1 = playerRun(hero, 1, seed)[0].build;
  d1.items = d1.items.filter((p) => ITEMS[p.def].kind !== "gate");
  const f1 = d1.items.find((p) => ITEMS[p.def].kind === "factory")!;
  out.push({ name: "swift-day1-old-rules", s: snap("old", { ...cloneBuild(d1), items: d1.items.map((p) => (p.uid === f1.uid ? { ...p, ench: "swift" } : p)) }, { rules: "bb-0.9.7", day: 1, wins: 0, lives: 5 }), ok: false });
  return out;
}

describe("ENCHANT-1 E2: the client check and POST /v1/ghosts agree on the words, in both switch states", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-enchant1-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("ENCHANT_RULES: the literal of this rules version; the fixtures hold each kind of piece and the refusals", () => {
    expect(ENCHANT_RULES).toBe(RULES_VERSION);
    const fx = fixtures();
    expect(fx.filter((f) => f.ok).map((f) => f.name)).toEqual(["rig-fiery", "rig-wide", "factory-massive", "turret-braced", "rig-growing"]);
    expect(fx.filter((f) => !f.ok).length).toBeGreaterThanOrEqual(7);
  });

  it("each fixture: the client's verdict is the server's, ENCHANT on (as listed) and off (every one refused)", async () => {
    const fx = fixtures();
    const me = await testIdentity(0);
    const rows: string[] = [];
    for (const on of [true, false]) {
      setEnchant(on);
      for (const f of fx) {
        const body = JSON.stringify({ ...ownedBy(f.s, me), runId: `${f.s.runId}-${on ? "on" : "off"}` });
        const s = JSON.parse(body) as GhostSnapshot; // the client judges exactly the bytes the server gets
        const client = validateUpload(s.build, s.day, s.rules, { seed: s.seed });
        const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
        const text = await r.text();
        rows.push(`${on ? "on " : "off"} ${f.name}: client ${client.ok ? "ok" : client.errors[0]} | server ${r.status} ${r.status === 201 ? "" : text.slice(0, 140)}`);
        expect(r.status === 201, `${f.name} ${on ? "on" : "off"}: server ${r.status} ${text.slice(0, 300)} vs client ${JSON.stringify(client.errors)}`).toBe(client.ok);
        // the client's verdict: the listed one with ENCHANT on and these rules; every fixture refused with it off
        expect(client.ok, `${f.name} ${on ? "on" : "off"}: ${JSON.stringify(client.errors)}`).toBe(on && f.ok);
      }
    }
    setEnchant(ENCHANT);
    for (const r of rows) console.log(`E2 PIN ${r}`);
    expect(rows.filter((r) => r.startsWith("off") && r.includes("rig-fiery"))[0]).toContain("not in this rules version yet");
    expect(rows.filter((r) => r.startsWith("on ") && r.includes("swift-day1-old-rules"))[0]).toContain(`predate ${ENCHANT_RULES}`);
    expect(rows.filter((r) => r.startsWith("on ") && r.includes("rig-massive"))[0]).toContain("NOT ON A RIG");
  }, 300_000);
});
