// 0.8.0 U2 M2 (REQ-BFG-016, REQ-BFG-009): the uploads step's probe (server/ghostProbe.ts, a port of 0.7.0 U1's) against the
// in-process ghost server, through its command line (probeMain) as the deploy's call runs it, on the JSON-lines store and
// on the Tigris store over the fake S3 (tools/fakeS3.ts). Uploads open: all nine checks pass, exit 0, and the store holds
// exactly the four decks FURNACE, WEAVER, FOUNDRY and BASTION, each its own record, under the player id the probe wrote to
// its id file before its first POST. Uploads closed: every POST gets 403, exit 1, nothing is stored, and the id file is
// still written first. A bad command line exits 2 and sends nothing; a dead port fails every check with "no answer",
// exit 1. The plan's decks: each row from an honest deck, the bytes the encoder's. Network-free (127.0.0.1 only).
// BELTS (REQ-BFG-043, REQ-BFG-044): the probe's rules are bb-0.8.3 (PROBE_RULES), since PACKS bb-0.8.6 and since RUNES-1 bb-0.8.7, the same four heroes and nine checks. FLIP-X2: bb-0.9.0 (the one bump), each deck with its dawn runes. BAL-2: bb-0.9.1 (the bump).
// Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE is the game's rule, so the plan has eleven rows: lastchance-signed (201) and
// lastchance-day3 (422) after hero-SIPHON (REPORT-ZPREP section 6 item 4): eleven checks, 14 lines, and five decks stored
// (FURNACE's LAST CHANCE deck, d6 0W 2L, too).
// BUMP-1D (REQ-BFG-059, REQ-BFG-116; the 10-wins release, bb-0.11.0; RULING-BUMP-R1 R1.2): the long run is the game's rule, so the
// server asks every upload to state its `losses` (records.ts lossesProblem) and every row does, and the plan has fifteen rows:
// longrun-signed (an honest day-12 deck, 201) and longrun-nolosses (the same without `losses`, which RUN-1's upload check
// refuses alone, 422) after npcday-forged: fifteen checks, 18 lines, seven decks stored (FURNACE's day-12 deck, too).
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGhostServer, type GhostServer } from "../server/app";
import { JsonlStore } from "../server/store";
import { canonicalText, probeMain, probePlan, PROBE_SEED } from "../server/ghostProbe"; // FLIP-X2: the probe decks' run seed
import { NPC_ROAD, NPC_ROAD_ERROR } from "../server/ghostProbe"; // AZ-BUMP: the NPC day's two rows
import { LONG_DUSK, LOSSES_ERROR, probeHasLongRun, probeStored } from "../server/ghostProbe"; // BUMP-1D: the long run's two rows
import { RIVALS, warlordOffer } from "../src/sim/rivals"; // AZ-BUMP: the NPC-day rows' warlords on PROBE_SEED
import { warlordDeck, warlordDrop } from "../src/game/road"; // AZ-BUMP: their seeded rolls
import { decodeSnapshot, encodeSnapshot, ghostId, SnapshotError, type GhostSnapshot } from "../src/net/snapshot";
import { isReachable, lossesProblem } from "../src/net/records"; // BUMP-1D: lossesProblem, RUN-1's upload check
import { validateBuild, validateUpload } from "../src/net/validate";
import { withHearts } from "../src/sim/hearts"; // HULL-ON (HEARTS; ruling 12a42239093fb6ec): the pre-hearts rows (the off check)
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D: the pre-long-run rows (the off check)
import type { FakeS3 } from "../tools/fakeS3";
import { startFake, tigrisFor } from "./netStores";

// Z-BUMP: the flip (was the nine rows, without lastchance-signed and lastchance-day3)
const NAMES = ["furnace-signed", "furnace-unsigned", "dishonest-signed", "unreachable-signed", "hero-WEAVER", "hero-FOUNDRY", "hero-BASTION", "hero-METRONOME", "hero-SIPHON", "lastchance-signed", "lastchance-day3", "npcday-signed", "npcday-forged", "longrun-signed", "longrun-nolosses"]; // BUMP-1D: the bump (the long run's two rows; was thirteen). AZ-BUMP: the bump (the NPC day's two rows; was eleven)
const STATUSES = ["201", "401", "422", "422", "201", "201", "201", "400", "400", "201", "422", "201", "422", "201", "422"]; // BUMP-1D: the bump (the long run's 201 and 422; was thirteen). AZ-BUMP: the bump (the NPC day's 201 and 422; was eleven). Z-BUMP: the flip (was nine, without the last 201 and 422)
const ACCEPTS = "rules bb-0.11.0 accept only FURNACE, WEAVER, FOUNDRY, BASTION"; // BUMP-1D: the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1)
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
  it("uploads open: fifteen checks, each as expected, exit 0; the store holds exactly the seven decks, each its own record, under the id file's player", async () => { // BUMP-1D: the bump (was eleven checks and the five decks, a title the AZ-BUMP pins had left behind)
    const { base, idFile, log, idAtPost, held } = await serve(kind, "open");
    const lines: string[] = [];
    expect(await probeMain([base, idFile], (l) => lines.push(l))).toBe(0);
    const id = readFileSync(idFile, "utf8");
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}\n$/); // a device key's player id, one line
    const player = id.trim();
    // the output: a header, one line per check (name, expected, got), the player id, then the summary with the stored count
    expect(lines[0]).toBe(`probe: POST ${base}/v1/ghosts as a fresh device (rules bb-0.11.0); only the FURNACE, WEAVER, FOUNDRY and BASTION decks may be stored`); // BUMP-1D: the bump (was bb-0.10.0)
    const checks = checkLines(lines);
    expect(checks.map((l) => l.split(/\s+/)[1])).toEqual(NAMES);
    for (const l of checks) expect(l).toMatch(/^PASS {2}\S+ +expected: \d{3} .+ \| got: \d{3} .+$/);
    expect(checks[0]).toMatch(/^PASS {2}furnace-signed {5}expected: 201 \{"id":"(g[0-9a-f]{14})"\} \| got: 201 \{"id":"\1"\}$/);
    expect(checks[1]).toContain("| got: 401 unsigned upload: the x-bb-key and x-bb-sig headers are required");
    expect(checks[2]).toMatch(/\| got: 422 deck failed validation: budget: build costs \d+ gold \(.*\) but a player's day 1 allows at most \d+/);
    // BUMP-1D (RUN-1): the row states its losses (0: no dusk is fought before dusk 1), so the record error names them (was "0W 1 lives is no record ...")
    expect(checks[3]).toContain("| got: 422 record: 0W 1 lives and 0 losses is no record a run carries into dusk 1");
    for (const i of [4, 5, 6]) expect(checks[i]).toMatch(/expected: 201 \{"id":"(g[0-9a-f]{14})"\} \| got: 201 \{"id":"\1"\}$/);
    expect(checks[7]).toContain(`| got: 400 snapshot.hero: ${ACCEPTS}, not METRONOME`);
    expect(checks[8]).toContain(`| got: 400 snapshot.hero: ${ACCEPTS}, not SIPHON`);
    // Z-BUMP (the flip): the two LAST CHANCE rows, pinned as rows 0 and 3 are
    expect(checks[9]).toMatch(/^PASS {2}lastchance-signed {2}expected: 201 \{"id":"(g[0-9a-f]{14})"\} \| got: 201 \{"id":"\1"\}$/);
    // HULL-ON (the flip, HEARTS; cap's ruling 12a42239093fb6ec): the hearts rule's LAST CHANCE row, dusk 7 at 0W 1 heart (was
    // "0W 2 lives ... dusk 6", the 5-lives row)
    // BUMP-1D (RUN-1): the forged LAST CHANCE row states its 6 losses (every dusk before dusk 7 was lost), so the record error names them
    expect(checks[10]).toContain("| got: 422 record: 0W 1 lives and 6 losses is no record a run carries into dusk 7 after a LAST CHANCE on day 3");
    // AZ-BUMP (the bump): the NPC day's two rows, pinned as rows 0 and 2 are
    expect(checks[11]).toMatch(/^PASS {2}npcday-signed {6}expected: 201 \{"id":"(g[0-9a-f]{14})"\} \| got: 201 \{"id":"\1"\}$/);
    expect(checks[12]).toContain("| got: 422 deck failed validation: road: day 2: the seeded roll of LACEWING gave scatter, not dartgun");
    // BUMP-1D (the bump): the long run's two rows: an honest day-12 deck that states its losses (201), and the same without them,
    // which RUN-1's upload check (lossesProblem) refuses alone (422, its own error)
    expect(checks[13]).toMatch(/^PASS {2}longrun-signed {5}expected: 201 \{"id":"(g[0-9a-f]{14})"\} \| got: 201 \{"id":"\1"\}$/);
    expect(checks[14]).toBe(`PASS  longrun-nolosses   expected: 422 ${LOSSES_ERROR} | got: 422 ${LOSSES_ERROR}`);
    expect(LOSSES_ERROR).toBe("losses: a long run's upload states the dusks the run lost (snapshot.losses is missing; day - 1 = wins + losses + draws needs it)"); // written out in the probe, here again: the server's words, not read back from it
    expect(lines[lines.indexOf(checks[14]) + 1]).toBe(`probe player: ${player}`); // BUMP-1D: the bump (was checks[12]). AZ-BUMP: the bump (was checks[10]). Z-BUMP: the flip (was checks[8], then the last check)
    expect(lines.at(-1)).toBe(`probe: 15 of 15 checks as expected; the server stored 7 deck(s) for this player (expected 7); the player id is in ${idFile}`); // BUMP-1D: the bump (was 13 of 13, stored 6, expected 6). AZ-BUMP: the bump (was 11 of 11, stored 5, expected 5). Z-BUMP: the flip (was 9 of 9, stored 4, expected 4)
    expect(lines).toHaveLength(18); // BUMP-1D: the bump (was 16). AZ-BUMP: the bump (was 14). Z-BUMP: the flip (was 12)
    // the server's side: one POST per check, in order; the id file was written before the first one
    expect(posts(log)).toEqual(STATUSES);
    expect(idAtPost).toEqual(Array(15).fill(true)); // BUMP-1D: the bump (was 13). AZ-BUMP: the bump (was 11). Z-BUMP: the flip (was 9)
    // the store: exactly the seven 201 decks (BUMP-1D: was six; AZ-BUMP: was five), each its own record, all under the id file's player
    const recs = held();
    expect(recs).toHaveLength(7); // BUMP-1D: the bump (was 6). AZ-BUMP: the bump (was 5). Z-BUMP: the flip (was 4)
    const printed = checks.map((l) => /\| got: 201 \{"id":"(g[0-9a-f]{14})"\}$/.exec(l)?.[1]).filter((x): x is string => x !== undefined);
    expect(printed).toHaveLength(7); // BUMP-1D: the bump (was 6). AZ-BUMP: the bump (was 5). Z-BUMP: the flip (was 4)
    expect(recs.map((r) => r.id).sort()).toEqual([...printed].sort());
    expect(recs.map((r) => `${r.snapshot.hero} d${r.snapshot.day} ${r.snapshot.wins}W ${r.snapshot.lives}L ${r.snapshot.rules}`).sort())
      .toEqual(["bastion d3 1W 10L bb-0.11.0", "foundry d3 1W 10L bb-0.11.0", "furnace d1 0W 10L bb-0.11.0", "furnace d12 9W 10L bb-0.11.0", "furnace d7 0W 1L bb-0.11.0", "weaver d2 1W 10L bb-0.11.0", "weaver d3 1W 10L bb-0.11.0"]); // BUMP-1D: the bump (bb-0.11.0, was bb-0.10.0; and the long run's "furnace d12 9W 10L"). HULL-ON (the flip, HEARTS; ruling 12a42239093fb6ec): the rows' lives by heartsFor(PROBE_RULES): the start's 10 hearts, and the LAST CHANCE row at dusk 7 (was 5L each, and "furnace d6 0W 2L"). AZ-BUMP: the bump (was bb-0.9.7, without the NPC day's "weaver d2 1W 5L"). Z-BUMP: the bump (was bb-0.9.3) // Y7b2: the bump (was bb-0.9.1). Z-BUMP: the flip (was without "furnace d6 0W 2L")
    // BUMP-1D (RUN-1): every stored deck states its losses and the server keeps them: none lost but the LAST CHANCE deck's six (every dusk before 7)
    expect(recs.map((r) => `${r.snapshot.hero} d${r.snapshot.day} lost ${r.snapshot.losses}`).sort())
      .toEqual(["bastion d3 lost 0", "foundry d3 lost 0", "furnace d1 lost 0", "furnace d12 lost 0", "furnace d7 lost 6", "weaver d2 lost 0", "weaver d3 lost 0"]);
    for (const r of recs) {
      expect(r.snapshot.playerId).toBe(player);
      expect(ghostId(decodeSnapshot(JSON.stringify(r.snapshot)))).toBe(r.id);
      if (kind === "tigris") expect(r.key).toBe(`ghosts/bb-0.11.0/d${String(r.snapshot.day).padStart(2, "0")}/player/${r.id}.json`); // BUMP-1D: the bump (was bb-0.10.0; the day-12 deck is under d12)
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
    expect(posts(log)).toEqual(Array(15).fill("403")); // BUMP-1D: the bump (was 13). AZ-BUMP: the bump (was 11). Z-BUMP: the flip (was 9)
    expect(idAtPost).toEqual(Array(15).fill(true)); // BUMP-1D: the bump (was 13). AZ-BUMP: the bump (was 11). Z-BUMP: the flip (was 9)
    expect(held()).toEqual([]);
    if (fake) expect(fake.requests).toHaveLength(0); // closed answers before the store is touched
    expect(readFileSync(idFile, "utf8")).toMatch(/^[A-Za-z0-9_-]{43}\n$/);
    expect(lines.at(-1)).toBe(`probe: 0 of 15 checks as expected; the server stored 0 deck(s) for this player (expected 7); the player id is in ${idFile}`); // BUMP-1D: the bump (was 0 of 13, expected 6). AZ-BUMP: the bump (was 0 of 11, expected 5). Z-BUMP: the flip (was 0 of 9, expected 4)
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
    expect(lines.at(-1)).toBe(`probe: 0 of 15 checks as expected; the server stored 0 deck(s) for this player (expected 7); the player id is in ${idFile}`); // BUMP-1D: the bump (was 0 of 13, expected 6). AZ-BUMP: the bump (was 0 of 11, expected 5). Z-BUMP: the flip (was 0 of 9, expected 4)
  }, 60_000);

  it("its decks: every row is an honest deck but the dishonest one, on a reachable record but the unreachable one, as the encoder's canonical bytes", () => {
    const plan = probePlan("probe-plan-player", 1_790_000_000_000);
    expect(plan.map((p) => p.name)).toEqual(NAMES);
    expect(plan.map((p) => p.signed)).toEqual([true, false, true, true, true, true, true, true, true, true, true, true, true, true, true]); // BUMP-1D: the bump (was thirteen). AZ-BUMP: the bump (was eleven). Z-BUMP: the flip (was nine, without the last two)
    for (const p of plan) {
      const s = p.snapshot;
      // FLIP-X2 (cap's ruling 5d6d83ef57d1494c): every deck holds its `day` dawn runes (the bots' picks on PROBE_SEED), so
      // it travels as v3 with the seed under bb-0.9.0 (was { v: 2, rules: "bb-0.8.7" }, rune-less)
      expect(s).toMatchObject({ v: 3, rules: "bb-0.11.0", playerId: "probe-plan-player", createdAt: 1_790_000_000_000, seed: PROBE_SEED }); // BUMP-1D: the bump (was bb-0.10.0)
      expect(s.build.runes?.length, p.name).toBe(s.day);
      expect(validateUpload(s.build, s.day, s.rules, { seed: s.seed }).errors.filter((e) => e.startsWith("rune: ")), p.name).toEqual([]);
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
    // the heroes bb-0.11.0 takes (BUMP-1D: was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1): the bytes are exactly the game's encoder's (submitGhost's); each deck its own ghost id
    for (const p of plan.filter((q) => q.name !== "hero-METRONOME" && q.name !== "hero-SIPHON")) expect(p.text).toBe(encodeSnapshot(p.snapshot));
    expect(new Set(plan.slice(4, 7).map((p) => ghostId(p.snapshot))).size).toBe(3);
    // METRONOME and SIPHON: the encoder refuses them itself, and the strict decoder refuses their bytes for the hero only
    for (const [i, hero] of [[7, "METRONOME"], [8, "SIPHON"]] as const) {
      expect(() => encodeSnapshot(plan[i].snapshot)).toThrow(SnapshotError);
      expect(() => decodeSnapshot(plan[i].text)).toThrow(`snapshot.hero: ${ACCEPTS}, not ${hero}`);
      expect(JSON.parse(plan[i].text)).toEqual(JSON.parse(JSON.stringify(plan[i].snapshot)));
    }
    // AZ-BUMP (REQ-BFG-077, REQ-BFG-078; the bump): the NPC day's two rows. The written-out road (NPC_ROAD) is the game's own
    // on PROBE_SEED, each warlord's seeded roll (road.ts warlordDrop, as validate.ts roadProblem re-derives it); the honest
    // deck passes with its road log, and the forged drop gets validateUpload's road line, NPC_ROAD_ERROR, alone
    const [nd, nf] = [plan[11], plan[12]];
    for (const e of NPC_ROAD) {
      const id = warlordOffer(PROBE_SEED, e.day)[e.tier];
      expect(warlordDrop(PROBE_SEED, e.day, id, e.tier, warlordDeck(id, e.day)) ?? undefined, `day ${e.day}`).toBe(e.drop);
    }
    expect(RIVALS[warlordOffer(PROBE_SEED, 2).medium].name).toBe("LACEWING");
    expect(nd.snapshot.road).toEqual(NPC_ROAD);
    expect(nd.snapshot).toMatchObject({ hero: "weaver", day: 2, wins: 1, lives: 10 }); // HULL-ON (the flip, HEARTS): the start's 10 hearts (was 5)
    // HULL-ON (the flip, HEARTS; cap's ruling 12a42239093fb6ec, Q2): every row's lives come from the hearts rule through
    // heartsFor(PROBE_RULES), so a pre-hearts PROBE_RULES (HEARTS off) still gives the 5-lives rows: the unreachable row at 1,
    // the LAST CHANCE rows at dusk 6 with 2 (a LAST CHANCE on day 5), every other row at 5
    expect(plan.map((p) => `d${p.snapshot.day} ${p.snapshot.wins}W ${p.snapshot.lives}L`)).toEqual(["d1 0W 10L", "d1 0W 10L", "d1 0W 10L", "d1 0W 1L", "d3 1W 10L", "d3 1W 10L", "d3 1W 10L", "d3 1W 10L", "d3 1W 10L", "d7 0W 1L", "d7 0W 1L", "d2 1W 10L", "d2 1W 10L", "d12 9W 10L", "d12 9W 10L"]); // BUMP-1D: the bump (and the long run's two rows at day 12)
    expect(withHearts(() => probePlan("probe-plan-player", 1_790_000_000_000), false).map((p) => `d${p.snapshot.day} ${p.snapshot.wins}W ${p.snapshot.lives}L ${p.snapshot.lastChance?.day ?? "-"}`))
      .toEqual(["d1 0W 5L -", "d1 0W 5L -", "d1 0W 5L -", "d1 0W 1L -", "d3 1W 5L -", "d3 1W 5L -", "d3 1W 5L -", "d3 1W 5L -", "d3 1W 5L -", "d6 0W 2L 5", "d6 0W 2L 3", "d2 1W 5L -", "d2 1W 5L -", "d12 9W 5L -", "d12 9W 5L -"]); // BUMP-1D: the bump (and the long run's two rows, on the 5-lives scale too: no heart lost)
    expect(validateUpload(nd.snapshot.build, nd.snapshot.day, nd.snapshot.rules, { seed: nd.snapshot.seed, road: nd.snapshot.road })).toEqual({ ok: true, errors: [] });
    expect(nf.snapshot.build).toEqual(nd.snapshot.build);
    expect(nf.snapshot.road?.map((e) => e.drop)).toEqual([undefined, "dartgun"]);
    expect(validateUpload(nf.snapshot.build, nf.snapshot.day, nf.snapshot.rules, { seed: nf.snapshot.seed, road: nf.snapshot.road }).errors).toEqual([NPC_ROAD_ERROR]);
    expect(decodeSnapshot(nd.text).road).toEqual(NPC_ROAD);
  });

  // BUMP-1D (REQ-BFG-059, REQ-BFG-116; RULING-BUMP-R1 R1.2): the long run's side of the plan. Under the long run's rules the server asks
  // every upload to STATE its `losses` (records.ts lossesProblem), so every row does, in the encoder's canonical bytes; the record
  // model (isReachable with the snapshot's losses: day - 1 = wins + losses + draws) takes each honest row's record and refuses
  // the two forged records; and the two long-run rows are an honest day-12 deck and the same without `losses`
  it("the long run: every row states its losses, the record model takes them; day 12 is honest with them and refused without them, by RUN-1's upload check alone", () => {
    const plan = probePlan("probe-plan-player", 1_790_000_000_000);
    const rules = "bb-0.11.0";
    expect(probeHasLongRun()).toBe(true);
    // the dusks lost before each row's: none on the start rows (the hero rows' second dusk is a draw), all six on the LAST CHANCE rows
    expect(plan.map((p) => p.snapshot.losses)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 0, 0, 0, undefined]);
    expect(plan.map((p) => JSON.parse(p.text).losses)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 0, 0, 0, undefined]); // and the bytes carry them (canonicalText, the encoder), right after the seed
    for (const p of plan.filter((q) => q.snapshot.losses !== undefined)) expect(p.text, p.name).toContain(`"seed":${PROBE_SEED},"losses":${p.snapshot.losses}`);
    for (const p of plan) {
      const s = p.snapshot;
      const reach = isReachable(s.day, s.wins, s.lives, { lastChance: s.lastChance?.day ?? null, rules, ...(s.losses !== undefined ? { losses: s.losses } : {}) });
      expect(reach, p.name).toBe(p.name !== "unreachable-signed" && p.name !== "lastchance-day3"); // the two forged records, and no other
    }
    // a record's losses must add up (day - 1 = wins + losses + draws): the LAST CHANCE row's six dusks are all losses, not five and a draw
    // (a LAST CHANCE on day 6 needs hearts down to 3 before that loss, which the four earlier losses of five and a draw cannot do)
    expect(isReachable(7, 0, 1, { lastChance: 6, rules, losses: 6 })).toBe(true);
    expect(isReachable(7, 0, 1, { lastChance: 6, rules, losses: 5 })).toBe(false);
    // the honest day-12 row (a dusk past 10 at LONG_DUSK) and its forgery, the same deck and record without `losses`
    const [lr, bare] = [plan[13], plan[14]];
    expect(LONG_DUSK.day).toBeGreaterThan(10);
    expect(lr.snapshot).toMatchObject({ hero: "furnace", day: 12, wins: 9, lives: 10, losses: 0, rules });
    expect(lr.snapshot.build.runes).toHaveLength(12);
    expect(bare.snapshot).toMatchObject({ hero: "furnace", day: 12, wins: 9, lives: 10, rules });
    expect(bare.snapshot.losses).toBeUndefined();
    expect(bare.snapshot.build).toEqual(lr.snapshot.build);
    expect(JSON.parse(bare.text)).toEqual({ ...JSON.parse(lr.text), runId: bare.snapshot.runId, losses: undefined }); // the same deck and record but for the run id and the one field
    for (const p of [lr, bare]) {
      expect(validateUpload(p.snapshot.build, p.snapshot.day, rules, { seed: p.snapshot.seed })).toEqual({ ok: true, errors: [] }); // an honest deck
      expect(p.text).toBe(encodeSnapshot(p.snapshot));
      expect(decodeSnapshot(p.text).losses).toBe(p.snapshot.losses);
    }
    // what refuses `bare`, and only that: its record is one a run reaches (the record check takes it), so lossesProblem is what is left
    expect(isReachable(12, 9, 10, { lastChance: null, rules })).toBe(true);
    expect(lossesProblem(rules, undefined)).toBe(LOSSES_ERROR);
    expect(lossesProblem(rules, 0)).toBeNull();
    expect(isReachable(12, 9, 10, { lastChance: null, rules, losses: 0 })).toBe(true); // 9 wins and 2 draws
    expect(bare.expected).toBe(`422 ${LOSSES_ERROR}`);
    expect(bare.pass({ status: 422, text: "", error: LOSSES_ERROR })).toBe(true);
    expect(bare.pass({ status: 201, text: "", id: "g00000000000000" })).toBe(false);
    expect(bare.pass({ status: 422, text: "", error: "record: 9W 10 lives is no record a run carries into dusk 12" })).toBe(false); // another 422 is not this check
    expect(lr.pass({ status: 201, text: "", id: ghostId(lr.snapshot) })).toBe(true);
    expect(lr.pass({ status: 422, text: "", error: LOSSES_ERROR })).toBe(false);
    const encodable = plan.filter((q) => q.name !== "hero-METRONOME" && q.name !== "hero-SIPHON"); // the encoder refuses those two heroes
    expect(new Set(encodable.map((p) => ghostId(p.snapshot))).size).toBe(encodable.length - 1); // every deck its own ghost id but the unsigned row's twin
    expect(probeStored()).toBe(7);
  });

  it("the old path: before the long run (the switch off) the plan is the thirteen rows without `losses`, byte for byte the long run's plan but for that field", () => {
    const now = 1_790_000_000_000;
    const long = probePlan("probe-plan-player", now);
    const old = withLongRun(() => ({ plan: probePlan("probe-plan-player", now), has: probeHasLongRun(), stored: probeStored() }), false);
    expect(old.has).toBe(false);
    expect(old.stored).toBe(6);
    expect(old.plan.map((p) => p.name)).toEqual(NAMES.slice(0, 13));
    expect(old.plan.map((p) => p.snapshot.losses)).toEqual(Array(13).fill(undefined));
    for (const [i, p] of old.plan.entries()) {
      expect(p.text, p.name).not.toContain("losses");
      expect(p.text, p.name).toBe(long[i].text.replace(/,"losses":\d+/, "")); // the long run's row, unstated
    }
    // and the old plan's error texts carry no losses (the server says "... lives is no record ...", with none stated)
    expect(old.plan[3].expected).toBe("422 record: 0W 1 lives is no record a run carries into dusk 1");
    expect(old.plan[10].expected).toBe("422 record: 0W 1 lives is no record a run carries into dusk 7 after a LAST CHANCE on day 3");
    expect(long[3].expected).toBe("422 record: 0W 1 lives and 0 losses is no record a run carries into dusk 1");
    expect(long[10].expected).toBe("422 record: 0W 1 lives and 6 losses is no record a run carries into dusk 7 after a LAST CHANCE on day 3");
  });
});
