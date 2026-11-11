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
// BUMP-1E (REQ-BFG-098; the scaling release, bb-0.12.0): the twelve scaling pieces are the game's rule (SCALE_RIGS on), so the plan has
// sixteen rows: scale-signed (FURNACE's day-1 deck of the first row plus one GRUDGE ROD on cell 5,3, signed, 201; a server of an older
// build refuses the id as an unknown item) comes last, after longrun-nolosses: sixteen checks, 19 lines, eight decks stored (FURNACE's
// GRUDGE ROD deck, too). The rules literals below moved to bb-0.12.0 with the bump (P2b), each with its trail.
// BUMP-1F (RULING-BUMP1F-R13 R13.3; REQ-BFG-059, ENDLESS-1): the four ENDLESS rows of the release lane's kit probe (0.9.13), ported. The plan has twenty rows (the
// 17th row, gates-signed, is followed by endless-honest 201, endless-wins-cap 400 and endless-norecord 422: FURNACE's day-14 reference deck as the endless dusk of a run
// won on day 10, 3 endless wins and 3 hearts, and two variants of it) and runProbe sends a twenty-first check after them, the GET endless-match (200, an endless ghost; no
// deck): twenty-one checks, 24 lines, ten decks stored (FURNACE's endless day-14 deck, too; the match stores none). The endless rows follow probeHasEndless alone
// (the rules gate endlessFor): with the long run or the hearts switched off they stay in the plan, with the endless switch off they are gone.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGhostServer, parseMatchQuery, type GhostServer } from "../server/app"; // BUMP-1F (RULING-BUMP1F-R13 R13.3): + parseMatchQuery, the route's reading of the endless match request
import { JsonlStore } from "../server/store";
import { canonicalText, probeMain, probePlan, PROBE_SEED } from "../server/ghostProbe"; // FLIP-X2: the probe decks' run seed
import { NPC_ROAD, NPC_ROAD_ERROR } from "../server/ghostProbe"; // AZ-BUMP: the NPC day's two rows
import { LONG_DUSK, LOSSES_ERROR, probeHasLongRun, probeStored } from "../server/ghostProbe"; // BUMP-1D: the long run's two rows
import { probeHasScale } from "../server/ghostProbe"; // BUMP-1E: the scale row
import { VETERAN_BAD, VETERAN_MATCH, probeHasVeteran } from "../server/ghostProbe"; // BUMP-1I (REQ-BFG-125): the two VETERAN rows
import { withVeteran } from "../src/net/veteran"; // BUMP-1I: the probe without the veteran rows (the off check; synchronously only)
import { ENDLESS_CAP_WINS, ENDLESS_DUSK, ENDLESS_MATCH, ENDLESS_NORECORD, endlessRecordError, ENDLESS_WINS_ERROR, probeHasEndless } from "../server/ghostProbe"; // BUMP-1F (RULING-BUMP1F-R13 R13.3): the endless rows
import { withEndless } from "../src/sim/endless"; // BUMP-1F (RULING-BUMP1F-R13 R13.3): the pre-endless rows (the off check; synchronously only)
import { RIVALS, warlordOffer } from "../src/sim/rivals"; // AZ-BUMP: the NPC-day rows' warlords on PROBE_SEED
import { warlordDeck, warlordDrop } from "../src/game/road"; // AZ-BUMP: their seeded rolls
import { decodeSnapshot, encodeSnapshot, ghostId, SnapshotError, type GhostSnapshot } from "../src/net/snapshot";
import { endlessRecordProblem, isReachable, lossesProblem } from "../src/net/records"; // BUMP-1D: lossesProblem, RUN-1's upload check. BUMP-1F (RULING-BUMP1F-R13 R13.3): endlessRecordProblem, the endless record's check
import { validateBuild, validateUpload } from "../src/net/validate";
import { withHearts } from "../src/sim/hearts"; // HULL-ON (HEARTS; ruling 12a42239093fb6ec): the pre-hearts rows (the off check)
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D: the pre-long-run rows (the off check)
import { withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the pre-scale rows (the off check; synchronously only, never withScaleRigs(async ...)) and an older build's verdict
import type { FakeS3 } from "../tools/fakeS3";
import { startFake, tigrisFor } from "./netStores";

// Z-BUMP: the flip (was the nine rows, without lastchance-signed and lastchance-day3)
const NAMES = ["furnace-signed", "furnace-unsigned", "dishonest-signed", "unreachable-signed", "hero-WEAVER", "hero-FOUNDRY", "hero-BASTION", "hero-METRONOME", "hero-SIPHON", "lastchance-signed", "lastchance-day3", "npcday-signed", "npcday-forged", "longrun-signed", "longrun-nolosses", "scale-signed", "gates-signed", "endless-honest", "endless-wins-cap", "endless-norecord"]; // BUMP-1F (RULING-BUMP1F-R13 R13.3: the kit probe's three endless POSTs, server/ghostProbe.ts endlessDusk, follow the 17th row): was seventeen, gates-signed last. BUMP-1F (the probe's 17th row, server/ghostProbe.ts gatesDusk: a signed FURNACE day-3 deck with a FUSER and a WHETSTONE holding one word, 201 under bb-0.13.0; RULING-BUMP1F-R5 R5.2 (2)): was sixteen, scale-signed last. BUMP-1E: the bump (the scale row, last; was fifteen). BUMP-1D: the bump (the long run's two rows; was thirteen). AZ-BUMP: the bump (the NPC day's two rows; was eleven)
// BUMP-1F (RULING-BUMP1F-R13 R13.3): the check lines are the plan's twenty and the fourth endless check, the GET endless-match (runProbe sends it after the POSTs); the plan and the server's POST log hold NAMES and STATUSES
const CHECKS = [...NAMES, "endless-match", "veteran-match", "veteran-bad"]; // BUMP-1I (REQ-BFG-125, P2's probe rows bc695246: veteran-match and veteran-bad follow the endless match): was [...NAMES, "endless-match"] (twenty-one checks; now twenty-three)
const STATUSES = ["201", "401", "422", "422", "201", "201", "201", "400", "400", "201", "422", "201", "422", "201", "422", "201", "201", "201", "400", "422"]; // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless rows' 201, 400 and 422; the match is a GET, no POST): was seventeen. BUMP-1F (the 17th row's 201; was sixteen). BUMP-1E: the bump (the scale row's 201; was fifteen). BUMP-1D: the bump (the long run's 201 and 422; was thirteen). AZ-BUMP: the bump (the NPC day's 201 and 422; was eleven). Z-BUMP: the flip (was nine, without the last 201 and 422)
const ACCEPTS = "rules bb-0.16.0 accept only FURNACE, WEAVER, FOUNDRY, BASTION"; // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (label bb-0.14.0 -> bb-0.15.0, PROBE_RULES): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, PROBE_RULES): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, PROBE_RULES): was bb-0.12.0. BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1)
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
  it("uploads open: twenty-three checks (the twenty POSTs, the endless match and the two veteran rows), each as expected, exit 0; the store holds exactly the ten decks, each its own record, under the id file's player", async () => { // BUMP-1F (RULING-BUMP1F-R13 R13.3: the three endless POSTs and the GET endless-match): was seventeen checks and the nine decks. BUMP-1F (the 17th row, gates-signed): was sixteen checks and the eight decks. BUMP-1E: the bump (was fifteen checks and the seven decks). BUMP-1D: the bump (was eleven checks and the five decks, a title the AZ-BUMP pins had left behind)
    const { base, idFile, log, idAtPost, held } = await serve(kind, "open");
    const lines: string[] = [];
    expect(await probeMain([base, idFile], (l) => lines.push(l))).toBe(0);
    const id = readFileSync(idFile, "utf8");
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}\n$/); // a device key's player id, one line
    const player = id.trim();
    // the output: a header, one line per check (name, expected, got), the player id, then the summary with the stored count
    expect(lines[0]).toBe(`probe: POST ${base}/v1/ghosts as a fresh device (rules bb-0.16.0); only the FURNACE, WEAVER, FOUNDRY and BASTION decks may be stored`); // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (label bb-0.14.0 -> bb-0.15.0, PROBE_RULES): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, PROBE_RULES): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, PROBE_RULES): was bb-0.12.0. BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0)
    const checks = checkLines(lines);
    expect(checks.map((l) => l.split(/\s+/)[1])).toEqual(CHECKS); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was NAMES, the plan's rows (the endless match is the twenty-first check)
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
    // BUMP-1E (the bump): the scale row, last: FURNACE's honest day-1 deck plus one GRUDGE ROD, signed, stored (201, its own ghost id)
    expect(checks[15]).toMatch(/^PASS {2}scale-signed {7}expected: 201 \{"id":"(g[0-9a-f]{14})"\} \| got: 201 \{"id":"\1"\}$/);
    // BUMP-1F (the 17th row): the gates-and-words row: FURNACE's honest day-3 deck plus a FUSER and a WHETSTONE holding one word, signed, stored (201, its own ghost id) (BUMP-1F (RULING-BUMP1F-R13 R13.3): was the last row; the endless rows follow it)
    expect(checks[16]).toMatch(/^PASS {2}gates-signed {7}expected: 201 \{"id":"(g[0-9a-f]{14})"\} \| got: 201 \{"id":"\1"\}$/);
    // BUMP-1F (RULING-BUMP1F-R13 R13.3): the ENDLESS rows, last. Three POSTs: the honest day-14 endless dusk (FURNACE's reference deck; a run won on day 10, 3 endless wins and 3 hearts), signed,
    // stored (201, its own ghost id); the same with endlessWins 30 (400: the strict decode names the field and its range); the same with 3 endless wins and 2 hearts (422: a record no endless
    // leads to). Then the GET: a match request for an endless dusk gets an endless ghost (200), the probe's own, the only one the store holds. Each line's words are the server's, written out here
    expect(checks[17]).toMatch(/^PASS {2}endless-honest {5}expected: 201 \{"id":"(g[0-9a-f]{14})"\} \| got: 201 \{"id":"\1"\}$/);
    expect(checks[18]).toBe("PASS  endless-wins-cap   expected: 400 snapshot.endlessWins: expected an integer in 0..29 | got: 400 snapshot.endlessWins: expected an integer in 0..29");
    expect(checks[19]).toBe("PASS  endless-norecord   expected: 422 record: 3 endless wins and 2 hearts is no record a run won on day 10 carries into endless dusk 14 | got: 422 record: 3 endless wins and 2 hearts is no record a run won on day 10 carries into endless dusk 14");
    const honestId = /\| got: 201 \{"id":"(g[0-9a-f]{14})"\}$/.exec(checks[17])?.[1];
    expect(honestId).toMatch(/^g[0-9a-f]{14}$/);
    expect(checks[20]).toBe(`PASS  endless-match      expected: 200 an endless ghost (snapshot.mode endless) | got: 200 {"id":"${honestId}"}`);
    // BUMP-1I (REQ-BFG-125, P2's probe rows bc695246: veteran-match and veteran-bad follow the endless match): the 22nd and 23rd checks are GETs, no deck: a veteran's match request on the start record gets a ghost (200; no seed pool here, so a deck the probe stored is the ghost), streak=x gets the server's 400
    expect(checks[21]).toMatch(/^PASS {2}veteran-match {6}expected: 200 a ghost \(a veteran's request on the start record\) \| got: 200 \{"id":"(g[0-9a-f]{14})"\}$/);
    expect(checks[22]).toBe("PASS  veteran-bad        expected: 400 streak: expected an integer in 0..99 | got: 400 streak: expected an integer in 0..99");
    expect(lines[lines.indexOf(checks[22]) + 1]).toBe(`probe player: ${player}`); // BUMP-1I: the twenty-third check now (was checks[20], the endless match). // BUMP-1F (RULING-BUMP1F-R13 R13.3): the twenty-first check, the endless match (was checks[16], the 17th row). BUMP-1F: the 17th row (was checks[15]). BUMP-1E: the bump (was checks[14]). BUMP-1D: the bump (was checks[12]). AZ-BUMP: the bump (was checks[10]). Z-BUMP: the flip (was checks[8], then the last check)
    expect(lines.at(-1)).toBe(`probe: 23 of 23 checks as expected; the server stored 10 deck(s) for this player (expected 10); the player id is in ${idFile}`); // BUMP-1I (REQ-BFG-125, P2's probe rows bc695246: veteran-match and veteran-bad follow the endless match): was 21 of 21. BUMP-1F (RULING-BUMP1F-R13 R13.3: the three endless POSTs and the match, which is no deck): was 17 of 17, stored 9, expected 9. BUMP-1F (the 17th row): was 16 of 16, stored 8, expected 8. BUMP-1E: the bump (was 15 of 15, stored 7, expected 7). BUMP-1D: the bump (was 13 of 13, stored 6, expected 6). AZ-BUMP: the bump (was 11 of 11, stored 5, expected 5). Z-BUMP: the flip (was 9 of 9, stored 4, expected 4)
    expect(lines).toHaveLength(26); // BUMP-1I (REQ-BFG-125, P2's probe rows bc695246: veteran-match and veteran-bad follow the endless match): was 24. BUMP-1F (RULING-BUMP1F-R13 R13.3): was 20. BUMP-1F (the 17th row): was 19. BUMP-1E: the bump (was 18). BUMP-1D: the bump (was 16). AZ-BUMP: the bump (was 14). Z-BUMP: the flip (was 12)
    // the server's side: one POST per plan row, in order (the match is a GET, no POST); the id file was written before the first one
    expect(posts(log)).toEqual(STATUSES);
    expect(idAtPost).toEqual(Array(20).fill(true)); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 17. BUMP-1F (the 17th row): was 16. BUMP-1E: the bump (was 15). BUMP-1D: the bump (was 13). AZ-BUMP: the bump (was 11). Z-BUMP: the flip (was 9)
    // BUMP-1F (RULING-BUMP1F-R13 R13.3): and one GET of the match route after them, answered 200 (the request order: the twenty POSTs, then the match)
    expect(log.filter((l) => / (POST|GET) \/v1\/ghosts/.test(l)).map((l) => l.split(" ").slice(1, 4).join(" ")))
      .toEqual([...STATUSES.map((s) => `POST /v1/ghosts ${s}`), "GET /v1/ghosts/match 200", "GET /v1/ghosts/match 200", "GET /v1/ghosts/match 400"]); // BUMP-1I (REQ-BFG-125, P2's probe rows bc695246: veteran-match and veteran-bad follow the endless match): the veteran-match GET (200) and the veteran-bad GET (400) follow the endless match
    // the store: exactly the ten 201 decks (BUMP-1F R13.3: was nine; the 17th row: was eight; BUMP-1E: was seven; BUMP-1D: was six; AZ-BUMP: was five), each its own record, all under the id file's player
    const recs = held();
    expect(recs).toHaveLength(10); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless honest deck, the one deck of the four endless checks): was 9. BUMP-1F (the 17th row): was 8. BUMP-1E: the bump (was 7). BUMP-1D: the bump (was 6). AZ-BUMP: the bump (was 5). Z-BUMP: the flip (was 4)
    const printed = checks.map((l) => /\| got: 201 \{"id":"(g[0-9a-f]{14})"\}$/.exec(l)?.[1]).filter((x): x is string => x !== undefined);
    expect(printed).toHaveLength(10); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 9 (the match line says 200, not 201: no deck). BUMP-1F (the 17th row): was 8. BUMP-1E: the bump (was 7). BUMP-1D: the bump (was 6). AZ-BUMP: the bump (was 5). Z-BUMP: the flip (was 4)
    expect(recs.map((r) => r.id).sort()).toEqual([...printed].sort());
    expect(recs.map((r) => `${r.snapshot.hero} d${r.snapshot.day} ${r.snapshot.wins}W ${r.snapshot.lives}L ${r.snapshot.rules}`).sort())
      .toEqual(["bastion d3 1W 10L bb-0.16.0", "foundry d3 1W 10L bb-0.16.0", "furnace d1 0W 10L bb-0.16.0", "furnace d1 0W 10L bb-0.16.0", "furnace d12 9W 10L bb-0.16.0", "furnace d14 10W 3L bb-0.16.0", "furnace d3 1W 10L bb-0.16.0", "furnace d7 0W 1L bb-0.16.0", "weaver d2 1W 10L bb-0.16.0", "weaver d3 1W 10L bb-0.16.0"]); // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (label bb-0.14.0 -> bb-0.15.0, PROBE_RULES): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, PROBE_RULES): was bb-0.13.0. BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless row's "furnace d14 10W 3L", the 10 wins of the won run and the endless run's 3 hearts): was nine records. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, PROBE_RULES; and the 17th row's "furnace d3 1W 10L", the gates deck): was eight records, all bb-0.12.0. BUMP-1E: the bump (bb-0.12.0, was bb-0.11.0; and the scale row's second "furnace d1 0W 10L"). BUMP-1D: the bump (bb-0.11.0, was bb-0.10.0; and the long run's "furnace d12 9W 10L"). HULL-ON (the flip, HEARTS; ruling 12a42239093fb6ec): the rows' lives by heartsFor(PROBE_RULES): the start's 10 hearts, and the LAST CHANCE row at dusk 7 (was 5L each, and "furnace d6 0W 2L"). AZ-BUMP: the bump (was bb-0.9.7, without the NPC day's "weaver d2 1W 5L"). Z-BUMP: the bump (was bb-0.9.3) // Y7b2: the bump (was bb-0.9.1). Z-BUMP: the flip (was without "furnace d6 0W 2L")
    // BUMP-1D (RUN-1): every stored deck states its losses and the server keeps them: none lost but the LAST CHANCE deck's six (every dusk before 7)
    expect(recs.map((r) => `${r.snapshot.hero} d${r.snapshot.day} lost ${r.snapshot.losses}`).sort())
      .toEqual(["bastion d3 lost 0", "foundry d3 lost 0", "furnace d1 lost 0", "furnace d1 lost 0", "furnace d12 lost 0", "furnace d14 lost 0", "furnace d3 lost 0", "furnace d7 lost 6", "weaver d2 lost 0", "weaver d3 lost 0"]); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless row's "furnace d14 lost 0", the won run's none lost; was nine). BUMP-1F (the 17th row's "furnace d3 lost 0"; was eight). BUMP-1E: the bump (the scale row's second "furnace d1 lost 0")
    // BUMP-1E (the bump): the scale row's deck is stored as a record of its own, the id its line printed: FURNACE's day-1 deck with one
    // GRUDGE ROD on cell 5,3 (the other "furnace d1" record is the honest row's, which holds none)
    const rods = recs.filter((r) => r.snapshot.build.items.some((p) => p.def === "grudgerod"));
    expect(rods.map((r) => `${r.snapshot.hero} d${r.snapshot.day}`)).toEqual(["furnace d1"]);
    expect(rods[0].snapshot.build.items.filter((p) => p.def === "grudgerod").map((p) => [p.x, p.y])).toEqual([[5, 3]]);
    expect(rods[0].id).toBe(/\| got: 201 \{"id":"(g[0-9a-f]{14})"\}$/.exec(checks[15])?.[1]);
    // BUMP-1F (the 17th row): the gates row's deck is stored as a record of its own, the id its line printed: FURNACE's day-3 deck with a FUSER and a
    // WHETSTONE holding one word (the other "furnace d3" ... there is none: the stored heroes are WEAVER, FOUNDRY and BASTION)
    const fusers = recs.filter((r) => r.snapshot.build.items.some((p) => p.def === "fuser"));
    expect(fusers.map((r) => `${r.snapshot.hero} d${r.snapshot.day}`)).toEqual(["furnace d3"]);
    expect(fusers[0].snapshot.build.items.filter((p) => p.def === "whetstone" && p.ench !== undefined)).toHaveLength(1); // the one word
    expect(fusers[0].id).toBe(/\| got: 201 \{"id":"(g[0-9a-f]{14})"\}$/.exec(checks[16])?.[1]);
    // BUMP-1F (RULING-BUMP1F-R13 R13.3): the endless row's deck is stored as a record of its own, the id its line printed (and the match served): FURNACE's day-14 deck as the endless dusk of a
    // run won on day 10, 3 endless wins and 3 hearts, with its seed and no road log. The two refused endless rows (400, 422) stored nothing, and the match stores nothing
    const endless = recs.filter((r) => r.snapshot.mode !== undefined);
    expect(endless.map((r) => r.id)).toEqual([honestId]);
    expect(endless[0].snapshot).toMatchObject({ v: 3, rules: "bb-0.16.0", hero: "furnace", day: 14, wins: 10, lives: 3, losses: 0, mode: "endless", endlessWins: 3, endlessLives: 3, victoryDay: 10, seed: PROBE_SEED }); // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (label bb-0.14.0 -> bb-0.15.0, PROBE_RULES): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, PROBE_RULES): was bb-0.13.0.
    expect(endless[0].snapshot.build.runes).toHaveLength(14); // one dawn rune a day, the endless days 11-14 too
    expect(endless[0].snapshot.road).toBeUndefined();
    for (const r of recs) {
      expect(r.snapshot.playerId).toBe(player);
      expect(ghostId(decodeSnapshot(JSON.stringify(r.snapshot)))).toBe(r.id);
      if (kind === "tigris") expect(r.key).toBe(`ghosts/bb-0.16.0/d${String(r.snapshot.day).padStart(2, "0")}/player/${r.id}.json`); // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (label bb-0.14.0 -> bb-0.15.0, PROBE_RULES): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, PROBE_RULES): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, the object key's rules): was bb-0.12.0. BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0; the day-12 deck is under d12)
    }
    // no secret and no key material in the output: nothing longer than a player id that looks like base64url
    expect(lines.join("\n")).not.toMatch(/[A-Za-z0-9_-]{60,}/);
  }, 60_000);

  it("uploads closed: every POST gets 403, exit 1, nothing is stored; the id file is still written, before the first POST", async () => {
    const { base, idFile, log, idAtPost, held, fake } = await serve(kind, "closed");
    const lines: string[] = [];
    expect(await probeMain([base, idFile], (l) => lines.push(l))).toBe(1);
    const checks = checkLines(lines);
    expect(checks.map((l) => l.split(/\s+/)[1])).toEqual(CHECKS); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was NAMES
    for (const l of checks.slice(0, NAMES.length)) expect(l).toMatch(/^FAIL {2}\S+ +expected: .+ \| got: 403 uploads are not open yet$/); // BUMP-1F (RULING-BUMP1F-R13 R13.3): the twenty POSTs (was every check)
    // BUMP-1F (RULING-BUMP1F-R13 R13.3): the endless match is a GET, not an upload: the closed switch does not stop it, and the store, which holds nothing, has no endless ghost for it (404)
    expect(checks.at(-3)).toBe("FAIL  endless-match      expected: 200 an endless ghost (snapshot.mode endless) | got: 404 no ghost for this rules version, day and record yet"); // BUMP-1I (REQ-BFG-125, P2's probe rows bc695246: veteran-match and veteran-bad follow the endless match): was checks.at(-1)
    // BUMP-1I (REQ-BFG-125, P2's probe rows bc695246: veteran-match and veteran-bad follow the endless match): the veteran-match GET is no upload either and the store holds nothing (404, FAIL); veteran-bad is answered by the query check before the store is read (400, PASS)
    expect(checks.at(-2)).toBe("FAIL  veteran-match      expected: 200 a ghost (a veteran's request on the start record) | got: 404 no ghost for this rules version, day and record yet");
    expect(checks.at(-1)).toBe("PASS  veteran-bad        expected: 400 streak: expected an integer in 0..99 | got: 400 streak: expected an integer in 0..99");
    expect(posts(log)).toEqual(Array(20).fill("403")); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 17. BUMP-1F (the 17th row): was 16. BUMP-1E: the bump (was 15). BUMP-1D: the bump (was 13). AZ-BUMP: the bump (was 11). Z-BUMP: the flip (was 9)
    expect(idAtPost).toEqual(Array(20).fill(true)); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 17. BUMP-1F (the 17th row): was 16. BUMP-1E: the bump (was 15). BUMP-1D: the bump (was 13). AZ-BUMP: the bump (was 11). Z-BUMP: the flip (was 9)
    expect(held()).toEqual([]);
    if (fake) expect(fake.requests.filter((r) => r.op !== "LIST")).toEqual([]); // closed answers before the store is touched; BUMP-1F (RULING-BUMP1F-R13 R13.3): was fake.requests toHaveLength(0), but the match reads the store (LISTs of its days, nothing else)
    expect(readFileSync(idFile, "utf8")).toMatch(/^[A-Za-z0-9_-]{43}\n$/);
    expect(lines.at(-1)).toBe(`probe: 1 of 23 checks as expected; the server stored 0 deck(s) for this player (expected 10); the player id is in ${idFile}`); // BUMP-1I (REQ-BFG-125, P2's probe rows bc695246: veteran-match and veteran-bad follow the endless match): was 0 of 21 (veteran-bad passes: its 400 comes before the store is read). BUMP-1F (RULING-BUMP1F-R13 R13.3): was 0 of 17, expected 9. BUMP-1F (the 17th row): was 0 of 16, expected 8. BUMP-1E: the bump (was 0 of 15, expected 7). BUMP-1D: the bump (was 0 of 13, expected 6). AZ-BUMP: the bump (was 0 of 11, expected 5). Z-BUMP: the flip (was 0 of 9, expected 4)
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
    expect(checks.map((l) => l.split(/\s+/)[1])).toEqual(CHECKS); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was NAMES; the endless match gets no answer either
    for (const l of checks) expect(l).toMatch(/^FAIL {2}\S+ +expected: .+ \| got: no answer \(.+\)$/);
    expect(readFileSync(idFile, "utf8")).toMatch(/^[A-Za-z0-9_-]{43}\n$/);
    expect(lines.at(-1)).toBe(`probe: 0 of 23 checks as expected; the server stored 0 deck(s) for this player (expected 10); the player id is in ${idFile}`); // BUMP-1I (REQ-BFG-125, P2's probe rows bc695246: veteran-match and veteran-bad follow the endless match): was 0 of 21. BUMP-1F (RULING-BUMP1F-R13 R13.3): was 0 of 17, expected 9. BUMP-1F (the 17th row): was 0 of 16, expected 8. BUMP-1E: the bump (was 0 of 15, expected 7). BUMP-1D: the bump (was 0 of 13, expected 6). AZ-BUMP: the bump (was 0 of 11, expected 5). Z-BUMP: the flip (was 0 of 9, expected 4)
  }, 60_000);

  it("its decks: every row is an honest deck but the dishonest one, on a reachable record but the unreachable one, as the encoder's canonical bytes", () => {
    const plan = probePlan("probe-plan-player", 1_790_000_000_000);
    expect(plan.map((p) => p.name)).toEqual(NAMES);
    expect(plan.map((p) => p.signed)).toEqual([true, false, ...Array<boolean>(18).fill(true)]); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the three endless rows' trues): was seventeen (the second false, the other fifteen true). BUMP-1F (the 17th row's last true): was sixteen. BUMP-1E: the bump (was fifteen, without the scale row's last true). BUMP-1D: the bump (was thirteen). AZ-BUMP: the bump (was eleven). Z-BUMP: the flip (was nine, without the last two)
    for (const p of plan) {
      const s = p.snapshot;
      // FLIP-X2 (cap's ruling 5d6d83ef57d1494c): every deck holds its `day` dawn runes (the bots' picks on PROBE_SEED), so
      // it travels as v3 with the seed under bb-0.9.0 (was { v: 2, rules: "bb-0.8.7" }, rune-less)
      expect(s).toMatchObject({ v: 3, rules: "bb-0.16.0", playerId: "probe-plan-player", createdAt: 1_790_000_000_000, seed: PROBE_SEED }); // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (label bb-0.14.0 -> bb-0.15.0, PROBE_RULES): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, PROBE_RULES): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, PROBE_RULES): was bb-0.12.0. BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0)
      expect(s.build.runes?.length, p.name).toBe(s.day);
      expect(validateUpload(s.build, s.day, s.rules, { seed: s.seed }).errors.filter((e) => e.startsWith("rune: ")), p.name).toEqual([]);
      expect(validateBuild(s.build, s.day, "player").ok, p.name).toBe(p.name !== "dishonest-signed");
      // BUMP-1F (RULING-BUMP1F-R13 R13.3): an endless row's record (10 wins of the won run, then the endless run's hearts) is the endless model's (records.ts endlessRecordProblem; the endless rows' own test below), not a run's
      if (s.mode === undefined) expect(isReachable(s.day, s.wins, s.lives), p.name).toBe(p.name !== "unreachable-signed");
      expect(canonicalText(s)).toBe(p.text); // the hand-built text is the encoder's form (checked against it just below); BUMP-1F (RULING-BUMP1F-R13 R13.3): and the endless fields too, for the one row the encoder refuses
    }
    // the unsigned check sends exactly the signed check's bytes
    expect(plan[1].text).toBe(plan[0].text);
    // the budget error is validateUpload's, and only the record differs between the honest and the unreachable deck
    expect(validateUpload(plan[2].snapshot.build, 1).errors[0]).toMatch(/^budget: /);
    expect(plan[3].snapshot.build).toEqual(plan[0].snapshot.build);
    expect(validateUpload(plan[3].snapshot.build, 1).ok).toBe(true);
    // the heroes bb-0.13.0 takes (BUMP-1F: was bb-0.12.0; BUMP-1E: was bb-0.11.0; BUMP-1D: was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1): the bytes are exactly the game's encoder's (submitGhost's); each deck its own ghost id
    for (const p of plan.filter((q) => q.name !== "hero-METRONOME" && q.name !== "hero-SIPHON" && q.name !== "endless-wins-cap")) expect(p.text).toBe(encodeSnapshot(p.snapshot)); // BUMP-1F (RULING-BUMP1F-R13 R13.3): and not endless-wins-cap, whose endlessWins the encoder refuses (its own test below)
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
    expect(plan.map((p) => `d${p.snapshot.day} ${p.snapshot.wins}W ${p.snapshot.lives}L`)).toEqual(["d1 0W 10L", "d1 0W 10L", "d1 0W 10L", "d1 0W 1L", "d3 1W 10L", "d3 1W 10L", "d3 1W 10L", "d3 1W 10L", "d3 1W 10L", "d7 0W 1L", "d7 0W 1L", "d2 1W 10L", "d2 1W 10L", "d12 9W 10L", "d12 9W 10L", "d1 0W 10L", "d3 1W 10L", "d14 10W 3L", "d14 10W 3L", "d14 10W 2L"]); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless rows at day 14, the won run's 10 wins and the endless run's 3 hearts, or 2 for the row no endless leads to): was seventeen. BUMP-1F (the 17th row at day 3, a win and a draw, the start's hearts): was sixteen. BUMP-1E: the bump (and the scale row at day 1, the start's hearts). BUMP-1D: the bump (and the long run's two rows at day 12)
    expect(withHearts(() => probePlan("probe-plan-player", 1_790_000_000_000), false).map((p) => `d${p.snapshot.day} ${p.snapshot.wins}W ${p.snapshot.lives}L ${p.snapshot.lastChance?.day ?? "-"}`))
      .toEqual(["d1 0W 5L -", "d1 0W 5L -", "d1 0W 5L -", "d1 0W 1L -", "d3 1W 5L -", "d3 1W 5L -", "d3 1W 5L -", "d3 1W 5L -", "d3 1W 5L -", "d6 0W 2L 5", "d6 0W 2L 3", "d2 1W 5L -", "d2 1W 5L -", "d12 9W 5L -", "d12 9W 5L -", "d1 0W 5L -", "d3 1W 5L -", "d14 10W 3L -", "d14 10W 3L -", "d14 10W 2L -"]); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless rows keep their endless hearts, 3 and 2, with HEARTS off: the endless run's hearts are the endless rule's own, not the run's scale; probeHasEndless asks the endless gate alone): was seventeen. BUMP-1F (the 17th row, on the 5-lives scale too): was sixteen. BUMP-1E: the bump (and the scale row, on the 5-lives scale too). BUMP-1D: the bump (and the long run's two rows, on the 5-lives scale too: no heart lost)
    expect(validateUpload(nd.snapshot.build, nd.snapshot.day, nd.snapshot.rules, { seed: nd.snapshot.seed, road: nd.snapshot.road })).toEqual({ ok: true, errors: [] });
    expect(nf.snapshot.build).toEqual(nd.snapshot.build);
    expect(nf.snapshot.road?.map((e) => e.drop)).toEqual([undefined, "dartgun"]);
    expect(validateUpload(nf.snapshot.build, nf.snapshot.day, nf.snapshot.rules, { seed: nf.snapshot.seed, road: nf.snapshot.road }).errors).toEqual([NPC_ROAD_ERROR]);
    expect(decodeSnapshot(nd.text).road).toEqual(NPC_ROAD);
  });

  // BUMP-1E (REQ-BFG-098; the scaling release, bb-0.12.0): the sixteenth row. FURNACE's honest day-1 deck of the first row plus ONE GRUDGE ROD
  // (one of the seven new ids) on cell 5,3, signed, last in the plan. The server of this build stores it (201); a server of an older build
  // refuses the id as an unknown item, so the 201 proves the live server knows the twelve
  it("the scale row: the first row's honest deck plus one GRUDGE ROD on cell 5,3, signed, last; it states its losses (0), passes the upload check, and its text is the encoder's", () => {
    const plan = probePlan("probe-plan-player", 1_790_000_000_000);
    const rules = "bb-0.16.0"; // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (label bb-0.14.0 -> bb-0.15.0, PROBE_RULES): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, PROBE_RULES): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, PROBE_RULES): was bb-0.12.0
    expect(probeHasScale()).toBe(true);
    expect(plan).toHaveLength(20); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the three endless rows): was 17. BUMP-1F (the 17th row, gates-signed): was 16
    expect(plan.filter((p) => p.name === "scale-signed")).toHaveLength(1); // one scale row
    // BUMP-1F (RULING-BUMP1F-R13 R13.3): the three endless rows come last now (after gates-signed), so the scale row is fifth to last (was plan.length - 2; the 17th row's: was [plan[0], plan[plan.length - 1]])
    const [first, sc] = [plan[0], plan[plan.length - 5]];
    expect(first.name).toBe("furnace-signed");
    expect(sc.name).toBe("scale-signed"); // and it comes after longrun-nolosses, before gates-signed
    expect(plan.at(-6)?.name).toBe("longrun-nolosses"); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was plan.at(-3); the 17th row's: was plan.at(-2)
    expect(plan.at(-4)?.name).toBe("gates-signed"); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was plan.at(-1): the 17th row follows it, and the endless rows follow that
    expect(plan.at(-1)?.name).toBe("endless-norecord"); // BUMP-1F (RULING-BUMP1F-R13 R13.3): the last endless POST
    expect(sc.signed).toBe(true);
    // the deck: the first row's and exactly one item more (GRUDGE ROD on cell 5,3, a uid of its own); nothing else of the build differs
    expect(sc.snapshot.build.items).toHaveLength(first.snapshot.build.items.length + 1);
    expect(sc.snapshot.build.items.slice(0, -1)).toEqual(first.snapshot.build.items);
    expect(sc.snapshot.build.items.at(-1)).toEqual({ uid: expect.any(Number), def: "grudgerod", x: 5, y: 3 });
    expect(new Set(sc.snapshot.build.items.map((p) => p.uid)).size).toBe(sc.snapshot.build.items.length);
    expect({ ...sc.snapshot.build, items: first.snapshot.build.items }).toEqual(first.snapshot.build); // the same belt, mods, hull and runes
    // the record is the first row's too (FURNACE at dusk 1, no win, the start's hearts): nothing differs but the build and the run id
    expect({ ...sc.snapshot, build: first.snapshot.build, runId: first.snapshot.runId }).toEqual(first.snapshot);
    expect(sc.snapshot.runId).not.toBe(first.snapshot.runId);
    expect(sc.snapshot).toMatchObject({ v: 3, rules, hero: "furnace", day: 1, wins: 0, lives: 10, losses: 0, seed: PROBE_SEED });
    // it STATES its losses (0: no dusk is fought before dusk 1), in the bytes too, right after the seed
    expect(sc.snapshot.losses).toBe(0);
    expect(JSON.parse(sc.text).losses).toBe(0);
    expect(sc.text).toContain(`"seed":${PROBE_SEED},"losses":0`);
    // honest: this build's upload check takes it under bb-0.13.0 (and the player mode's) (BUMP-1F: was bb-0.12.0), its record is one a run carries into dusk 1,
    // and the long run's losses check has nothing to ask of it
    expect(validateUpload(sc.snapshot.build, sc.snapshot.day, rules, { seed: PROBE_SEED })).toEqual({ ok: true, errors: [] });
    expect(validateBuild(sc.snapshot.build, sc.snapshot.day, "player").ok).toBe(true);
    expect(isReachable(1, 0, 10, { lastChance: null, rules, losses: 0 })).toBe(true);
    expect(lossesProblem(rules, sc.snapshot.losses)).toBeNull();
    // its bytes are the encoder's (the hand-built canonical text too), and its ghost id is its own
    expect(sc.text).toBe(encodeSnapshot(sc.snapshot));
    expect(canonicalText(sc.snapshot)).toBe(sc.text);
    expect(decodeSnapshot(sc.text).build.items).toEqual(sc.snapshot.build.items);
    expect(sc.expected).toBe(`201 {"id":"${ghostId(sc.snapshot)}"}`);
    expect(ghostId(sc.snapshot)).not.toBe(ghostId(first.snapshot));
  });

  // BUMP-1D (REQ-BFG-059, REQ-BFG-116; RULING-BUMP-R1 R1.2): the long run's side of the plan. Under the long run's rules the server asks
  // every upload to STATE its `losses` (records.ts lossesProblem), so every row does, in the encoder's canonical bytes; the record
  // model (isReachable with the snapshot's losses: day - 1 = wins + losses + draws) takes each honest row's record and refuses
  // the two forged records; and the two long-run rows are an honest day-12 deck and the same without `losses`
  it("the long run: every row states its losses, the record model takes them; day 12 is honest with them and refused without them, by RUN-1's upload check alone", () => {
    const plan = probePlan("probe-plan-player", 1_790_000_000_000);
    const rules = "bb-0.16.0"; // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (label bb-0.14.0 -> bb-0.15.0, PROBE_RULES): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, PROBE_RULES): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, PROBE_RULES): was bb-0.12.0. BUMP-1E: the bump (was bb-0.11.0): the snapshot's own rules (toMatchObject below), and the long run holds from bb-0.11.0 on
    expect(probeHasLongRun()).toBe(true);
    // the dusks lost before each row's: none on the start rows (the hero rows' second dusk is a draw), all six on the LAST CHANCE rows
    // BUMP-1E: and none on the scale row (day 1: no dusk fought), which states them as every row but the forged one does
    expect(plan.map((p) => p.snapshot.losses)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 0, 0, 0, undefined, 0, 0, 0, 0, 0]); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the three endless rows' 0: the won run lost no dusk before its victory day; was seventeen). BUMP-1F (the 17th row's 0: a win and a draw, none lost; was sixteen). BUMP-1E: the bump (the scale row's 0; was fifteen)
    expect(plan.map((p) => JSON.parse(p.text).losses)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 0, 0, 0, undefined, 0, 0, 0, 0, 0]); // and the bytes carry them (canonicalText, the encoder), right after the seed. BUMP-1F (RULING-BUMP1F-R13 R13.3: the three endless rows' 0; was seventeen). BUMP-1F (the 17th row's 0; was sixteen). BUMP-1E: the bump (the scale row's 0; was fifteen)
    for (const p of plan.filter((q) => q.snapshot.losses !== undefined)) expect(p.text, p.name).toContain(`"seed":${PROBE_SEED},"losses":${p.snapshot.losses}`);
    for (const p of plan.filter((q) => q.snapshot.mode === undefined)) { // BUMP-1F (RULING-BUMP1F-R13 R13.3): the run rows; an endless row's record is the endless model's (the endless rows' own test)
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
    const encodable = plan.filter((q) => q.name !== "hero-METRONOME" && q.name !== "hero-SIPHON" && q.name !== "endless-wins-cap"); // the encoder refuses those two heroes; BUMP-1F (RULING-BUMP1F-R13 R13.3): and endlessWins 30
    expect(new Set(encodable.map((p) => ghostId(p.snapshot))).size).toBe(encodable.length - 1); // every deck its own ghost id but the unsigned row's twin
    expect(probeStored()).toBe(10); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless honest deck): was 9. BUMP-1F (the 17th row's honest deck): was 8. BUMP-1E: the bump (was 7; the scale row's honest deck)
  });

  // BUMP-1E: the scaling pieces are the build's rule, not the long run's, so with the long run's switch off the plan still has the scale row
  // (the scaling switch stays on): the thirteen rows and then the scale row, the long run's two rows between them gone, none stating `losses`
  it("the old path: before the long run (the switch off) the plan is the thirteen rows, the scale and gates rows and the endless rows, none with `losses`, byte for byte the long run's plan but for that field (and the endless rows' day-14 deck)", () => { // BUMP-1F (RULING-BUMP1F-R13 R13.3): + the endless rows, which follow the endless gate alone. BUMP-1F (the 17th row): the gates row (the title had left it out)
    const now = 1_790_000_000_000;
    const long = probePlan("probe-plan-player", now);
    const old = withLongRun(() => ({ plan: probePlan("probe-plan-player", now), has: probeHasLongRun(), stored: probeStored() }), false);
    expect(old.has).toBe(false);
    expect(old.stored).toBe(9); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless honest deck is stored with the long run off too: probeHasEndless asks the endless gate alone): was 8. BUMP-1F (the 17th row's honest deck is stored with the long run off too): was 7. BUMP-1E: the bump (was 6; the scale row's honest deck is stored with the long run off too)
    expect(old.plan.map((p) => p.name)).toEqual([...NAMES.slice(0, 13), "scale-signed", "gates-signed", ...NAMES.slice(17)]); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the three endless rows follow the gates row): was [...NAMES.slice(0, 13), "scale-signed", "gates-signed"]. BUMP-1F (the 17th row follows the scale row): was [...NAMES.slice(0, 13), "scale-signed"]. BUMP-1E: the bump (was NAMES.slice(0, 13): the scale row follows the thirteen)
    expect(old.plan.map((p) => p.snapshot.losses)).toEqual(Array(18).fill(undefined)); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 15. BUMP-1F (the 17th row): was 14. BUMP-1E: the bump (was 13)
    // BUMP-1E: the old plan's row i is the long run's row i for the thirteen, and the scale row is the long run's second to last, the gates row its last (the long run's own two rows lie between) (BUMP-1F: the scale row was the last)
    // BUMP-1F (RULING-BUMP1F-R13 R13.3): and the gates row is followed by the three endless rows, the long run's last three (the decoder refuses `losses` there, so they state none, as every row does; was long.length - (15 - i))
    const at = (i: number): number => (i < 13 ? i : long.length - (18 - i));
    for (const [i, p] of old.plan.entries()) {
      expect(long[at(i)].name, p.name).toBe(p.name);
      expect(p.text, p.name).not.toContain("losses");
      if (p.snapshot.mode === undefined) expect(p.text, p.name).toBe(long[at(i)].text.replace(/,"losses":\d+/, "")); // the long run's row, unstated
      else {
        // BUMP-1F (RULING-BUMP1F-R13 R13.3): an endless row is the long run's row but for `losses` and its deck: the day-14 reference deck of the 10-day world, whose tables clamp that day to 10 (less hull: 900 against 1400),
        // is not the long run's; the record, the run id and the lives are the same
        expect({ ...p.snapshot, build: undefined, losses: undefined }, p.name).toEqual({ ...long[at(i)].snapshot, build: undefined, losses: undefined });
        expect(p.snapshot.build.hullBonus, p.name).toBeLessThan(long[at(i)].snapshot.build.hullBonus);
      }
    }
    // and the old plan's error texts carry no losses (the server says "... lives is no record ...", with none stated)
    expect(old.plan[3].expected).toBe("422 record: 0W 1 lives is no record a run carries into dusk 1");
    expect(old.plan[10].expected).toBe("422 record: 0W 1 lives is no record a run carries into dusk 7 after a LAST CHANCE on day 3");
    expect(long[3].expected).toBe("422 record: 0W 1 lives and 0 losses is no record a run carries into dusk 1");
    expect(long[10].expected).toBe("422 record: 0W 1 lives and 6 losses is no record a run carries into dusk 7 after a LAST CHANCE on day 3");
  });

  // BUMP-1E: the scaling switch off (a build without the twelve): there is no scale row, and the other fifteen rows are the scale plan's
  // first fifteen. The two plans are made at the same player id and time, so their bytes are comparable. withScaleRigs(fn, false) is
  // synchronous only: its finally puts the switch back at the first await (never withScaleRigs(async ...))
  // BUMP-1F (the 17th row, gates-signed): the gates row is not the scaling switch's (probeHasGates: the gates and the words, switches of their
  // own), so with the scaling switch off the plan is still the fifteen rows and then the gates row: sixteen, eight decks stored (was fifteen, seven)
  // BUMP-1F (RULING-BUMP1F-R13 R13.3): nor are the endless rows (probeHasEndless: the endless gate): they follow the gates row, so it is nineteen rows and nine decks (was sixteen, eight)
  it("the old path: before the scaling pieces (the switch off) the plan is the fifteen rows, the gates row and the endless rows, byte for byte the scale plan's rows but for the scale row; nine decks", () => {
    const now = 1_790_000_000_000;
    const full = probePlan("probe-plan-player", now);
    const old = withScaleRigs(() => ({ plan: probePlan("probe-plan-player", now), has: probeHasScale(), stored: probeStored() }), false);
    expect(probeHasScale()).toBe(true); // the switch is back
    expect(probeStored()).toBe(10); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless honest deck): was 9. BUMP-1F (the 17th row's honest deck): was 8
    expect(old.has).toBe(false);
    expect(old.stored).toBe(9); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless deck is stored with the scaling switch off too): was 8. BUMP-1F (the gates row's honest deck is stored with the scaling switch off too): was 7
    expect(full).toHaveLength(20); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 17. BUMP-1F: was 16
    expect(old.plan).toHaveLength(19); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 16. BUMP-1F: was 15
    expect(old.plan.map((p) => p.name)).toEqual([...NAMES.slice(0, 15), ...NAMES.slice(16)]); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the gates row and the endless rows follow the fifteen): was [...NAMES.slice(0, 15), "gates-signed"]. BUMP-1F (the gates row follows the fifteen): was NAMES.slice(0, 15)
    expect(old.plan.some((p) => p.name === "scale-signed" || p.text.includes("grudgerod"))).toBe(false);
    for (const [i, p] of old.plan.entries()) {
      const f = full[i < 15 ? i : i + 1]; // BUMP-1F (RULING-BUMP1F-R13 R13.3): the old plan's row i is the full plan's row i for the fifteen, and the gates row and the endless rows are the full plan's last four (the scale row lies between); was full[i < 15 ? i : full.length - 1]. BUMP-1F: the gates row is the full plan's last (the scale row lies between); was full[i]
      expect(p.name).toBe(f.name);
      expect(p.text, p.name).toBe(f.text);
      expect(p.snapshot, p.name).toEqual(f.snapshot);
      expect(p.signed, p.name).toBe(f.signed);
      expect(p.expected, p.name).toBe(f.expected);
    }
  });

  // BUMP-1E: the row is refused by a server of an older build, and the probe's own check says so: only a 201 with the row's id passes
  it("the scale row is refused by a server of an older build (the id is an unknown item): its own pass takes the 201 with its id and nothing else", () => {
    const sc = probePlan("probe-plan-player", 1_790_000_000_000).at(-5)!; // BUMP-1F (RULING-BUMP1F-R13 R13.3: the gates row and the three endless rows follow it): was .at(-2). BUMP-1F (the 17th row, gates-signed, is last now): was .at(-1)
    expect(sc.name).toBe("scale-signed");
    const id = ghostId(sc.snapshot);
    // a build without the twelve judges the same deck with the scaling switch off: the one new id is an unknown item, nothing else is wrong
    // with the deck (validate.ts validateBuild); server/app.ts POST step 5 answers that as a 422 "deck failed validation" with those errors
    const uid = sc.snapshot.build.items.find((p) => p.def === "grudgerod")!.uid;
    const older = withScaleRigs(() => validateUpload(sc.snapshot.build, sc.snapshot.day, sc.snapshot.rules, { seed: PROBE_SEED }), false);
    expect(older).toEqual({ ok: false, errors: [`item: uid ${uid} is unknown item "grudgerod"`] });
    expect(probeHasScale()).toBe(true); // the switch is back
    expect(sc.pass({ status: 201, id, text: "" })).toBe(true);
    expect(sc.pass({ status: 422, error: "deck failed validation", errors: older.errors, text: "" })).toBe(false);
    expect(sc.pass({ status: 201, id: "g00000000000000", text: "" })).toBe(false); // a 201 for another deck
    expect(sc.pass({ status: 201, text: "" })).toBe(false); // a 201 that names no deck
    expect(sc.pass({ status: 200, id, text: "" })).toBe(false); // a 200 is a deck the store already held: this row is the first of its bytes
    expect(sc.pass({ status: 403, error: "uploads are not open yet", text: "" })).toBe(false);
    expect(sc.pass({ status: 400, error: "snapshot.build.items[1].def: expected a string", text: "" })).toBe(false);
  });

  // BUMP-1F (RULING-BUMP1F-R13 R13.3; REQ-BFG-059, ENDLESS-1): the four ENDLESS rows of the kit probe of 0.9.13, ported. Rows 1-3 are the plan's last three POSTs: FURNACE's day-14 reference
  // deck with its fourteen dawn runes, as the dusk of day 14 of a run won on day 10 that went on into endless (10 wins, losses 0, mode "endless", victoryDay 10), with its seed and no road log.
  // With 3 endless wins and 3 hearts it is honest (201). With endlessWins 30, the win that ends endless, the strict decode refuses it (400, the field named). With 3 endless wins and 2 hearts the
  // decoder takes it and no endless leads to it (422, the record). Row 4, the GET endless-match (ENDLESS_MATCH), is runProbe's: the end-to-end tests above and in zprep.probe.test.ts send it
  it("the endless rows: FURNACE's day-14 deck as the endless dusk of a run won on day 10; the honest one passes every check, each other row is refused by one check alone, and its own pass takes only that answer", () => {
    const now = 1_790_000_000_000;
    const plan = probePlan("probe-plan-player", now);
    const rules = "bb-0.16.0"; // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (label bb-0.14.0 -> bb-0.15.0, PROBE_RULES): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, PROBE_RULES): was bb-0.13.0.
    expect(probeHasEndless()).toBe(true);
    const [en, cap, nr] = plan.slice(-3);
    expect([en.name, cap.name, nr.name]).toEqual(["endless-honest", "endless-wins-cap", "endless-norecord"]);
    expect([en.signed, cap.signed, nr.signed]).toEqual([true, true, true]);
    // the records the rows state, written out here again (the probe's ENDLESS_DUSK, ENDLESS_NORECORD and ENDLESS_CAP_WINS)
    expect(ENDLESS_DUSK).toEqual({ day: 14, wins: 10, lives: 3, victoryDay: 10, endlessWins: 3, endlessLives: 3 });
    expect(ENDLESS_NORECORD).toEqual({ endlessWins: 3, endlessLives: 2, lives: 2 });
    expect(ENDLESS_CAP_WINS).toBe(30);
    const run = { v: 3, rules, hero: "furnace", day: 14, wins: 10, losses: 0, mode: "endless", victoryDay: 10, seed: PROBE_SEED, playerId: "probe-plan-player", createdAt: now, name: "PROBE" };
    expect(en.snapshot).toMatchObject({ ...run, lives: 3, endlessWins: 3, endlessLives: 3 }); // `lives` is the endless hearts (the decoder holds it equal to endlessLives)
    expect(cap.snapshot).toMatchObject({ ...run, lives: 3, endlessWins: 30, endlessLives: 3 });
    expect(nr.snapshot).toMatchObject({ ...run, lives: 2, endlessWins: 3, endlessLives: 2 });
    // one deck in all three: FURNACE's, with one dawn rune a day to day 14 (the endless days 11-14 too); no road log; each its own run id
    expect(en.snapshot.build.hero).toBe("furnace");
    expect(en.snapshot.build.runes).toHaveLength(14);
    expect(cap.snapshot.build).toEqual(en.snapshot.build);
    expect(nr.snapshot.build).toEqual(en.snapshot.build);
    for (const p of [en, cap, nr]) {
      expect(p.snapshot.road, p.name).toBeUndefined();
      expect(p.text, p.name).not.toContain('"road"');
    }
    expect(new Set([en, cap, nr].map((p) => p.snapshot.runId)).size).toBe(3);
    // the bytes: the honest and the no-record rows are the encoder's, the endless group right after the seed and the losses, in the decoder's order; endless-wins-cap is the honest row's
    // but for the run id and the one number, the canonical text built by hand (the encoder refuses it as the decoder does)
    const tail = (wins: number, hearts: number): string => `"seed":${PROBE_SEED},"losses":0,"mode":"endless","endlessWins":${wins},"endlessLives":${hearts},"victoryDay":10}`;
    expect(en.text).toBe(encodeSnapshot(en.snapshot));
    expect(en.text.endsWith(tail(3, 3))).toBe(true);
    expect(nr.text).toBe(encodeSnapshot(nr.snapshot));
    expect(nr.text.endsWith(tail(3, 2))).toBe(true);
    expect(cap.text.endsWith(tail(30, 3))).toBe(true);
    expect(cap.text.replace('"endlessWins":30', '"endlessWins":3').replace(cap.snapshot.runId, en.snapshot.runId)).toBe(en.text);
    expect(() => encodeSnapshot(cap.snapshot)).toThrow(SnapshotError);
    expect(() => decodeSnapshot(cap.text)).toThrow("snapshot.endlessWins: expected an integer in 0..29");
    expect(JSON.parse(cap.text)).toEqual(JSON.parse(JSON.stringify(cap.snapshot)));
    expect(JSON.parse(en.text)).toEqual(JSON.parse(JSON.stringify(en.snapshot)));
    expect(decodeSnapshot(en.text).endlessWins).toBe(3);
    expect(decodeSnapshot(nr.text).endlessLives).toBe(2);
    // the honest row: this build's upload check takes the deck on its seed, the losses check has nothing to ask of it, and the endless model takes (3 endless wins, 3 hearts) of a run won on day 10
    const record = (s: GhostSnapshot) => endlessRecordProblem({ rules: s.rules, day: s.day, victoryDay: s.victoryDay!, endlessWins: s.endlessWins!, endlessLives: s.endlessLives!, losses: s.losses });
    for (const p of [en, nr]) expect(validateUpload(p.snapshot.build, p.snapshot.day, rules, { seed: p.snapshot.seed }), p.name).toEqual({ ok: true, errors: [] });
    expect(lossesProblem(rules, en.snapshot.losses)).toBeNull();
    expect(record(en.snapshot)).toBeNull();
    expect(en.expected).toBe(`201 {"id":"${ghostId(en.snapshot)}"}`);
    expect(ghostId(nr.snapshot)).not.toBe(ghostId(en.snapshot));
    // what refuses endless-norecord, and only that: the same deck passes the upload check, and the endless model has no path of the three endless dusks (days 11-13) to 3 wins and 2 hearts
    const norecord = "record: 3 endless wins and 2 hearts is no record a run won on day 10 carries into endless dusk 14"; // the server's words, written out in the probe, here again
    expect(record(nr.snapshot)).toBe(norecord);
    expect(endlessRecordError(ENDLESS_NORECORD)).toBe(norecord);
    expect(nr.expected).toBe(`422 ${norecord}`);
    // what refuses endless-wins-cap, and only that: the decoder's range (the win that ends endless is no snapshot's), before any other check
    expect(ENDLESS_WINS_ERROR).toBe("snapshot.endlessWins: expected an integer in 0..29");
    expect(cap.expected).toBe("400 snapshot.endlessWins: expected an integer in 0..29");
    // each row's own pass takes its own answer and no other
    const id = ghostId(en.snapshot);
    expect(en.pass({ status: 201, text: "", id })).toBe(true);
    expect(en.pass({ status: 200, text: "", id })).toBe(false); // a 200 is a deck the store already held: this row is the first of its bytes
    expect(en.pass({ status: 201, text: "", id: "g00000000000000" })).toBe(false); // a 201 for another deck
    expect(en.pass({ status: 201, text: "" })).toBe(false); // a 201 that names no deck
    expect(en.pass({ status: 422, text: "", error: "deck failed validation", errors: ["budget: build costs 99 gold"] })).toBe(false);
    expect(cap.pass({ status: 400, text: "", error: ENDLESS_WINS_ERROR })).toBe(true);
    expect(cap.pass({ status: 400, text: "", error: "snapshot.endlessLives: expected an integer in 1..3" })).toBe(false); // another 400 is not this check
    expect(cap.pass({ status: 400, text: "" })).toBe(false); // a 400 that says nothing
    expect(cap.pass({ status: 201, text: "", id })).toBe(false); // a server that takes endlessWins 30
    expect(cap.pass({ status: 422, text: "", error: ENDLESS_WINS_ERROR })).toBe(false);
    expect(nr.pass({ status: 422, text: "", error: norecord })).toBe(true);
    expect(nr.pass({ status: 422, text: "", error: "record: no run wins its 10th on day 10 with 0 losses" })).toBe(false); // the run's own record error is not this check
    expect(nr.pass({ status: 422, text: "", error: LOSSES_ERROR })).toBe(false);
    expect(nr.pass({ status: 422, text: "", error: "deck failed validation", errors: ["budget: build costs 99 gold"] })).toBe(false);
    expect(nr.pass({ status: 400, text: "", error: norecord })).toBe(false);
    expect(nr.pass({ status: 201, text: "", id: ghostId(nr.snapshot) })).toBe(false); // a server that takes a record no endless leads to
  });

  // BUMP-1F (RULING-BUMP1F-R13 R13.3): the fourth endless row, the GET: the match request of an endless dusk of day 14 from another player with finished runs, under PROBE_RULES. It is an endless
  // request for this build's route (parseMatchQuery) and its pass takes a 200 that serves an endless ghost and nothing else
  it("the endless match: an endless request of day 14 under the probe's rules from another player; its pass takes a 200 that serves an endless ghost and no other answer", () => {
    expect(ENDLESS_MATCH.name).toBe("endless-match");
    expect(ENDLESS_MATCH.expected).toBe("200 an endless ghost (snapshot.mode endless)");
    expect(ENDLESS_MATCH.path).toBe("/v1/ghosts/match?rules=bb-0.16.0&runs=5&day=14&wins=2&lives=3&player=other-player&mode=endless"); // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (label bb-0.14.0 -> bb-0.15.0, PROBE_RULES): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, PROBE_RULES): was bb-0.13.0.
    expect(parseMatchQuery(new URLSearchParams(ENDLESS_MATCH.path.split("?")[1]))).toEqual({ rules: "bb-0.16.0", day: 14, wins: 2, lives: 3, playerId: "other-player", seen: [], runs: 5, endless: true }); // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (label bb-0.14.0 -> bb-0.15.0, PROBE_RULES): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, PROBE_RULES): was bb-0.13.0.
    const served = (snapshot: unknown): string => JSON.stringify({ id: "g00000000000000", snapshot });
    expect(ENDLESS_MATCH.pass({ status: 200, id: "g00000000000000", text: served({ day: 14, mode: "endless", endlessWins: 3, endlessLives: 3 }) })).toBe(true);
    expect(ENDLESS_MATCH.pass({ status: 200, id: "g00000000000000", text: served({ day: 14, wins: 2, lives: 3 }) })).toBe(false); // a run's ghost
    expect(ENDLESS_MATCH.pass({ status: 200, text: served(null) })).toBe(false);
    expect(ENDLESS_MATCH.pass({ status: 200, text: "[]" })).toBe(false);
    expect(ENDLESS_MATCH.pass({ status: 200, text: "not json" })).toBe(false);
    expect(ENDLESS_MATCH.pass({ status: 404, error: "no ghost for this rules version, day and record yet", text: JSON.stringify({ error: "no ghost for this rules version, day and record yet" }) })).toBe(false);
    expect(ENDLESS_MATCH.pass({ status: 400, error: "mode: endless is not in this rules version yet", text: served({ mode: "endless" }) })).toBe(false); // the status decides first
  });

  // BUMP-1I (REQ-BFG-125, P2's probe rows bc695246): the two VETERAN rows, in the form of the endless match above: two GETs, no deck, sent after the endless match (the probe's 22nd and 23rd checks).
  it("the veteran rows: a veteran's match request (streak=2) on the start record passes on a 200 that serves a day-1 ghost; streak=x passes on the server's 400 and no other answer; both follow probeHasVeteran alone", () => {
    expect(VETERAN_MATCH.name).toBe("veteran-match");
    expect(VETERAN_MATCH.expected).toBe("200 a ghost (a veteran's request on the start record)");
    expect(VETERAN_MATCH.path).toBe("/v1/ghosts/match?rules=bb-0.16.0&runs=5&day=1&wins=0&lives=10&player=other-player&streak=2");
    expect(parseMatchQuery(new URLSearchParams(VETERAN_MATCH.path.split("?")[1]))).toEqual({ rules: "bb-0.16.0", day: 1, wins: 0, lives: 10, playerId: "other-player", seen: [], runs: 5, streak: 2 });
    const served = (snapshot: unknown): string => JSON.stringify({ id: "g00000000000000", snapshot });
    expect(VETERAN_MATCH.pass({ status: 200, id: "g00000000000000", text: served({ day: 1, wins: 0, lives: 10 }) })).toBe(true);
    expect(VETERAN_MATCH.pass({ status: 200, id: "g00000000000000", text: served({ day: 2, wins: 0, lives: 9 }) })).toBe(false);
    expect(VETERAN_MATCH.pass({ status: 200, text: served(null) })).toBe(false);
    expect(VETERAN_MATCH.pass({ status: 200, text: "not json" })).toBe(false);
    expect(VETERAN_MATCH.pass({ status: 404, error: "no ghost for this rules version, day and record yet", text: JSON.stringify({ error: "no ghost for this rules version, day and record yet" }) })).toBe(false);
    expect(VETERAN_BAD.name).toBe("veteran-bad");
    expect(VETERAN_BAD.expected).toBe("400 streak: expected an integer in 0..99");
    expect(VETERAN_BAD.path).toBe("/v1/ghosts/match?rules=bb-0.16.0&runs=5&day=1&wins=0&lives=10&player=other-player&streak=x");
    expect(() => parseMatchQuery(new URLSearchParams(VETERAN_BAD.path.split("?")[1]))).toThrow("streak: expected an integer in 0..99");
    expect(VETERAN_BAD.pass({ status: 400, error: "streak: expected an integer in 0..99", text: "" })).toBe(true);
    expect(VETERAN_BAD.pass({ status: 400, error: "rules: expected a rules version", text: "" })).toBe(false);
    expect(VETERAN_BAD.pass({ status: 200, id: "g00000000000000", text: served({ day: 1 }) })).toBe(false); // a build that does not read `streak` answers the request as any other, never 400
    expect(probeHasVeteran()).toBe(true);
    expect(withVeteran(() => probeHasVeteran(), false)).toBe(false); // the switch off: no veteran rows
  });

  // BUMP-1F (RULING-BUMP1F-R13 R13.3): the endless switch off (a build before endless; rules before ENDLESS_RULES answer the same, rulesGate.ts endlessFor): no endless rows, no fourth check, and the other
  // seventeen rows are the endless plan's first seventeen, byte for byte; nine decks (was ten). withEndless(fn, false) is synchronous only (its finally puts the switch back at the first await, never
  // withEndless(async ...)), so runProbe's GET is asked through probeHasEndless, the one gate it reads. The endless rows follow the endless gate alone: with the long run or HEARTS off they stay
  // (the long run's old path above, the HEARTS-off plan in "its decks"), as the scale and gates rows do
  it("the old path: before endless (the switch off) the plan is the seventeen rows, byte for byte the endless plan's first seventeen; nine decks, and no endless row to send", () => {
    const now = 1_790_000_000_000;
    const full = probePlan("probe-plan-player", now);
    const old = withEndless(() => ({ plan: probePlan("probe-plan-player", now), has: probeHasEndless(), stored: probeStored() }), false);
    expect(probeHasEndless()).toBe(true); // the switch is back
    expect(probeStored()).toBe(10);
    expect(old.has).toBe(false);
    expect(old.stored).toBe(9);
    expect(full).toHaveLength(20);
    expect(old.plan).toHaveLength(17);
    expect(old.plan.map((p) => p.name)).toEqual(NAMES.slice(0, 17));
    for (const [i, p] of old.plan.entries()) {
      expect(p.snapshot.mode, p.name).toBeUndefined();
      expect(p.text, p.name).not.toContain('"mode"');
      expect(p.name).toBe(full[i].name);
      expect(p.text, p.name).toBe(full[i].text);
      expect(p.snapshot, p.name).toEqual(full[i].snapshot);
      expect(p.signed, p.name).toBe(full[i].signed);
      expect(p.expected, p.name).toBe(full[i].expected);
    }
  });
});
