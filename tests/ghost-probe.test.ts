// 0.8.0 U2 M2 (REQ-BFG-016, REQ-BFG-009): the uploads step's probe (server/ghostProbe.ts, a port of 0.7.0 U1's) against the
// in-process ghost server, through its command line (probeMain) as the deploy's call runs it, on the JSON-lines store and
// on the Tigris store over the fake S3 (tools/fakeS3.ts). Uploads open: all nine checks pass, exit 0, and the store holds
// exactly the four decks FURNACE, WEAVER, FOUNDRY and BASTION, each its own record, under the player id the probe wrote to
// its id file before its first POST. Uploads closed: every POST gets 403, exit 1, nothing is stored, and the id file is
// still written first. A bad command line exits 2 and sends nothing; a dead port fails every check with "no answer",
// exit 1. The plan's decks: each row from an honest deck, the bytes the encoder's. Network-free (127.0.0.1 only).
// BELTS (REQ-BFG-043, REQ-BFG-044): the probe's rules are bb-0.8.3 (PROBE_RULES), and since PACKS bb-0.8.6, the same four heroes and nine checks.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGhostServer, type GhostServer } from "../server/app";
import { JsonlStore } from "../server/store";
import { canonicalText, probeMain, probePlan } from "../server/ghostProbe";
import { decodeSnapshot, encodeSnapshot, ghostId, SnapshotError, type GhostSnapshot } from "../src/net/snapshot";
import { isReachable } from "../src/net/records";
import { validateBuild, validateUpload } from "../src/net/validate";
import type { FakeS3 } from "../tools/fakeS3";
import { startFake, tigrisFor } from "./netStores";

const NAMES = ["furnace-signed", "furnace-unsigned", "dishonest-signed", "unreachable-signed", "hero-WEAVER", "hero-FOUNDRY", "hero-BASTION", "hero-METRONOME", "hero-SIPHON"];
const STATUSES = ["201", "401", "422", "422", "201", "201", "201", "400", "400"];
const ACCEPTS = "rules bb-0.8.6 accept only FURNACE, WEAVER, FOUNDRY, BASTION";
const KINDS = ["jsonl", "tigris"] as const;

interface Held {
  key: string;
  id: string;
  snapshot: GhostSnapshot;
}

interface Rig {
  app: GhostServer;
  base: string;
  dir: string;
  idFile: string;
  /** The server's request log, and whether the id file existed when each POST /v1/ghosts finished. */
  log: string[];
  idAtPost: boolean[];
  /** Every record the store holds, read from its files or its bucket. */
  held(): Held[];
  fake?: FakeS3;
}
let rig: Rig | null = null;

async function serve(kind: (typeof KINDS)[number], uploads: "open" | "closed"): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "bb-probe-"));
  const idFile = join(dir, "probe-id.txt");
  const log: string[] = [], idAtPost: boolean[] = [];
  const onLog = (line: string) => {
    log.push(line);
    if (/ POST \/v1\/ghosts /.test(line)) idAtPost.push(existsSync(idFile));
  };
  if (kind === "jsonl") {
    const store = new JsonlStore(join(dir, "data"));
    store.load();
    const app = createGhostServer({ store, uploads, log: onLog });
    const held = (): Held[] => (existsSync(store.file) ? readFileSync(store.file, "utf8").split("\n").filter(Boolean) : []).map((l, i) => {
      const r = JSON.parse(l) as { id: string; snapshot: GhostSnapshot };
      return { key: `ghosts.jsonl:${i + 1}`, id: r.id, snapshot: r.snapshot };
    });
    rig = { app, base: `http://127.0.0.1:${await app.listen(0)}`, dir, idFile, log, idAtPost, held };
    expect(existsSync(store.poolFile)).toBe(false); // no seed pool here: the store starts empty
  } else {
    const fake = await startFake();
    const app = createGhostServer({ store: tigrisFor(fake), uploads, log: onLog });
    const held = (): Held[] => fake.keys("bb-test").map((key) => {
      const r = JSON.parse(fake.getObject("bb-test", key) ?? "null") as { id: string; snapshot: GhostSnapshot };
      return { key, id: r.id, snapshot: r.snapshot };
    });
    rig = { app, base: `http://127.0.0.1:${await app.listen(0)}`, dir, idFile, log, idAtPost, held, fake };
  }
  return rig;
}

afterEach(async () => {
  if (!rig) return;
  await rig.app.close();
  await rig.fake?.close();
  rmSync(rig.dir, { recursive: true, force: true });
  rig = null;
});

/** The status of each POST /v1/ghosts in the server's request log, in order. */
const posts = (log: string[]) => log.filter((l) => / POST \/v1\/ghosts /.test(l)).map((l) => l.split(" ")[3]);
const checkLines = (lines: string[]) => lines.filter((l) => /^(PASS|FAIL) {2}/.test(l));

describe.each(KINDS)("the uploads step's probe (ghost-probe.mjs), %s store", (kind) => {
  it("uploads open: nine checks, each as expected, exit 0; the store holds exactly the four decks, each its own record, under the id file's player", async () => {
    const { base, idFile, log, idAtPost, held } = await serve(kind, "open");
    const lines: string[] = [];
    expect(await probeMain([base, idFile], (l) => lines.push(l))).toBe(0);
    const id = readFileSync(idFile, "utf8");
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}\n$/); // a device key's player id, one line
    const player = id.trim();
    // the output: a header, one line per check (name, expected, got), the player id, then the summary with the stored count
    expect(lines[0]).toBe(`probe: POST ${base}/v1/ghosts as a fresh device (rules bb-0.8.6); only the FURNACE, WEAVER, FOUNDRY and BASTION decks may be stored`);
    const checks = checkLines(lines);
    expect(checks.map((l) => l.split(/\s+/)[1])).toEqual(NAMES);
    for (const l of checks) expect(l).toMatch(/^PASS {2}\S+ +expected: \d{3} .+ \| got: \d{3} .+$/);
    expect(checks[0]).toMatch(/^PASS {2}furnace-signed {5}expected: 201 \{"id":"(g[0-9a-f]{14})"\} \| got: 201 \{"id":"\1"\}$/);
    expect(checks[1]).toContain("| got: 401 unsigned upload: the x-bb-key and x-bb-sig headers are required");
    expect(checks[2]).toMatch(/\| got: 422 deck failed validation: budget: build costs \d+ gold \(.*\) but a player's day 1 allows at most \d+/);
    expect(checks[3]).toContain("| got: 422 record: 0W 1 lives is no record a run carries into dusk 1");
    for (const i of [4, 5, 6]) expect(checks[i]).toMatch(/expected: 201 \{"id":"(g[0-9a-f]{14})"\} \| got: 201 \{"id":"\1"\}$/);
    expect(checks[7]).toContain(`| got: 400 snapshot.hero: ${ACCEPTS}, not METRONOME`);
    expect(checks[8]).toContain(`| got: 400 snapshot.hero: ${ACCEPTS}, not SIPHON`);
    expect(lines[lines.indexOf(checks[8]) + 1]).toBe(`probe player: ${player}`);
    expect(lines.at(-1)).toBe(`probe: 9 of 9 checks as expected; the server stored 4 deck(s) for this player (expected 4); the player id is in ${idFile}`);
    expect(lines).toHaveLength(12);
    // the server's side: one POST per check, in order; the id file was written before the first one
    expect(posts(log)).toEqual(STATUSES);
    expect(idAtPost).toEqual(Array(9).fill(true));
    // the store: exactly the four 201 decks, each its own record, all under the id file's player
    const recs = held();
    expect(recs).toHaveLength(4);
    const printed = checks.map((l) => /\| got: 201 \{"id":"(g[0-9a-f]{14})"\}$/.exec(l)?.[1]).filter((x): x is string => x !== undefined);
    expect(printed).toHaveLength(4);
    expect(recs.map((r) => r.id).sort()).toEqual([...printed].sort());
    expect(recs.map((r) => `${r.snapshot.hero} d${r.snapshot.day} ${r.snapshot.wins}W ${r.snapshot.lives}L ${r.snapshot.rules}`).sort())
      .toEqual(["bastion d3 1W 5L bb-0.8.6", "foundry d3 1W 5L bb-0.8.6", "furnace d1 0W 5L bb-0.8.6", "weaver d3 1W 5L bb-0.8.6"]);
    for (const r of recs) {
      expect(r.snapshot.playerId).toBe(player);
      expect(ghostId(decodeSnapshot(JSON.stringify(r.snapshot)))).toBe(r.id);
      if (kind === "tigris") expect(r.key).toBe(`ghosts/bb-0.8.6/d${String(r.snapshot.day).padStart(2, "0")}/player/${r.id}.json`);
    }
    // no secret and no key material in the output: nothing longer than a player id that looks like base64url
    expect(lines.join("\n")).not.toMatch(/[A-Za-z0-9_-]{60,}/);
  }, 60_000);

  it("uploads closed: every POST gets 403, exit 1, nothing is stored; the id file is still written, before the first POST", async () => {
    const { base, idFile, log, idAtPost, held, fake } = await serve(kind, "closed");
    const lines: string[] = [];
    expect(await probeMain([base, idFile], (l) => lines.push(l))).toBe(1);
    const checks = checkLines(lines);
    expect(checks.map((l) => l.split(/\s+/)[1])).toEqual(NAMES);
    for (const l of checks) expect(l).toMatch(/^FAIL {2}\S+ +expected: .+ \| got: 403 uploads are not open yet$/);
    expect(posts(log)).toEqual(Array(9).fill("403"));
    expect(idAtPost).toEqual(Array(9).fill(true));
    expect(held()).toEqual([]);
    if (fake) expect(fake.requests).toHaveLength(0); // closed answers before the store is touched
    expect(readFileSync(idFile, "utf8")).toMatch(/^[A-Za-z0-9_-]{43}\n$/);
    expect(lines.at(-1)).toBe(`probe: 0 of 9 checks as expected; the server stored 0 deck(s) for this player (expected 4); the player id is in ${idFile}`);
  }, 60_000);
});

describe("the uploads step's probe: refusals and its decks", () => {
  it("a bad command line, or an id file that already holds an id, exits 2 and sends nothing; no answer at all is a failed check, exit 1", async () => {
    const { base, dir, idFile, log } = await serve("jsonl", "open");
    const bad = [[], [base], [base, idFile, "extra"], ["ftp://127.0.0.1:1", idFile], [`${base}/v1`, idFile], [`${base}?x=1`, idFile], [`${base}#x`, idFile],
      ["not a url", idFile], [base.replace("http://", "http://user:pw@"), idFile], [base, "--apply"], [base, ""]];
    for (const argv of bad) {
      const lines: string[] = [];
      expect(await probeMain(argv, (l) => lines.push(l)), JSON.stringify(argv)).toBe(2);
      expect(lines.at(-1)).toMatch(/^usage: node server\/dist\/ghost-probe\.mjs <base-url> <id-file>/);
    }
    expect(existsSync(idFile)).toBe(false);
    // an id file that holds an earlier probe's id is never overwritten: that player still needs its clean-up
    const earlier = join(dir, "earlier-id.txt");
    writeFileSync(earlier, "an-earlier-probe-player-id\n");
    const kept: string[] = [];
    expect(await probeMain([base, earlier], (l) => kept.push(l))).toBe(2);
    expect(kept[0]).toBe(`ghost-probe: ${earlier} already holds a probe player id: clean that player up first (RUNBOOK section 9), then move the file away`);
    expect(readFileSync(earlier, "utf8")).toBe("an-earlier-probe-player-id\n");
    expect(posts(log)).toEqual([]);
    // a closed port: every POST fails without an answer, so every check fails (exit 1); the id file is written first
    const s = createServer(() => {});
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
    const a = s.address();
    const deadBase = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 1}`;
    await new Promise<void>((r) => s.close(() => r()));
    const lines: string[] = [];
    expect(await probeMain([deadBase, idFile], (l) => lines.push(l), 2000)).toBe(1);
    const checks = checkLines(lines);
    expect(checks.map((l) => l.split(/\s+/)[1])).toEqual(NAMES);
    for (const l of checks) expect(l).toMatch(/^FAIL {2}\S+ +expected: .+ \| got: no answer \(.+\)$/);
    expect(readFileSync(idFile, "utf8")).toMatch(/^[A-Za-z0-9_-]{43}\n$/);
    expect(lines.at(-1)).toBe(`probe: 0 of 9 checks as expected; the server stored 0 deck(s) for this player (expected 4); the player id is in ${idFile}`);
  }, 60_000);

  it("its decks: every row is an honest deck but the dishonest one, on a reachable record but the unreachable one, as the encoder's canonical bytes", () => {
    const plan = probePlan("probe-plan-player", 1_790_000_000_000);
    expect(plan.map((p) => p.name)).toEqual(NAMES);
    expect(plan.map((p) => p.signed)).toEqual([true, false, true, true, true, true, true, true, true]);
    for (const p of plan) {
      const s = p.snapshot;
      expect(s).toMatchObject({ v: 2, rules: "bb-0.8.6", playerId: "probe-plan-player", createdAt: 1_790_000_000_000 });
      expect(validateBuild(s.build, s.day, "player").ok, p.name).toBe(p.name !== "dishonest-signed");
      expect(isReachable(s.day, s.wins, s.lives), p.name).toBe(p.name !== "unreachable-signed");
      expect(canonicalText(s)).toBe(p.text); // the hand-built text is the encoder's form (checked against it just below)
    }
    // the unsigned check sends exactly the signed check's bytes
    expect(plan[1].text).toBe(plan[0].text);
    // the budget error is validateUpload's, and only the record differs between the honest and the unreachable deck
    expect(validateUpload(plan[2].snapshot.build, 1).errors[0]).toMatch(/^budget: /);
    expect(plan[3].snapshot.build).toEqual(plan[0].snapshot.build);
    expect(validateUpload(plan[3].snapshot.build, 1).ok).toBe(true);
    // the heroes bb-0.8.6 takes: the bytes are exactly the game's encoder's (submitGhost's); each deck its own ghost id
    for (const p of plan.filter((q) => q.name !== "hero-METRONOME" && q.name !== "hero-SIPHON")) expect(p.text).toBe(encodeSnapshot(p.snapshot));
    expect(new Set(plan.slice(4, 7).map((p) => ghostId(p.snapshot))).size).toBe(3);
    // METRONOME and SIPHON: the encoder refuses them itself, and the strict decoder refuses their bytes for the hero only
    for (const [i, hero] of [[7, "METRONOME"], [8, "SIPHON"]] as const) {
      expect(() => encodeSnapshot(plan[i].snapshot)).toThrow(SnapshotError);
      expect(() => decodeSnapshot(plan[i].text)).toThrow(`snapshot.hero: ${ACCEPTS}, not ${hero}`);
      expect(JSON.parse(plan[i].text)).toEqual(JSON.parse(JSON.stringify(plan[i].snapshot)));
    }
  });
});
