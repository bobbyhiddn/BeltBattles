// STAGE-091, backlog 338 (VERIFIED-U2 s3, mutant MY1; REQ-BFG-058): the uploads step's probe (server/ghostProbe.ts)
// against a deliberately misbehaving in-process server. tests/ghost-probe.test.ts pins the probe's exact output against a
// correct server, so it catches a misbehaving server (UM2, UM3) but not a probe made lenient against a correct one: MY1, a
// refused hero's row also passing on a 201 (`pass: (a) => a.status === 400 || a.status === 201`), stayed green there.
// Here each server is the real in-process app, built as ghost-probe.test.ts builds its correct one (server/app.ts
// createGhostServer on a JSON-lines store in a scratch folder, uploads open), with ONE of its checks switched off: a
// module mock wraps the real function and steps aside only while that switch is set (`off.check`), not a copy of the
// server. The checks: the signing headers (an unsigned deck is taken), the deck's budget (the dishonest deck), the record
// (the unreachable one), and the hero gate for METRONOME alone or SIPHON alone (heroes bb-0.9.1 refuses). Each such server
// takes a deck the real one refuses: 201, or 200 for the unsigned row, whose bytes are the signed row's (already stored).
// For each, the probe exits 1 and prints FAIL on exactly that row, and every other row still passes. With no switch set,
// the same rig passes all eleven (exit 0), as the correct server does.
// Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE is the game's rule, so the probe has eleven rows (lastchance-signed 201,
// lastchance-day3 422 after hero-SIPHON; was nine) and stores five decks (was four). The record check is split by the
// upload's LAST CHANCE (see its mock), and a sixth server switches off lastchance-day3's own check.
// AZ-BUMP (REQ-BFG-077, REQ-BFG-078; the bump to bb-0.10.0): the NPC day is the game's rule, so the probe has thirteen rows
// (npcday-signed 201, npcday-forged 422 after lastchance-day3; was eleven) and stores six decks (was five). A seventh
// server switches off npcday-forged's own check: validateUpload's road lines (validate.ts roadProblem), as "budget" drops
// its budget lines.
// BUMP-1D (REQ-BFG-059, REQ-BFG-116; the bump to bb-0.11.0; RULING-BUMP-R1 R1.2): the long run is the game's rule, so every row
// states its `losses` and the probe has fifteen rows (longrun-signed 201, longrun-nolosses 422 after npcday-forged; was
// thirteen) and stores seven decks (was six). An eighth server switches off longrun-nolosses' own check, RUN-1's upload check
// (records.ts lossesProblem, the mock below): the same deck and record as longrun-signed, which states none, is then taken.
// Every other row states its losses, so no other switch lets that row through and the new switch lets no other row through.
// BUMP-1E (REQ-BFG-098; the bump to bb-0.12.0): the twelve scaling pieces are the game's rule, so the probe has sixteen rows (scale-signed
// 201, the last, after longrun-nolosses; was fifteen) and stores eight decks (was seven): the single-case servers below read 15 of 16 with
// nine decks stored (expected eight). The scale row is a row the server must TAKE, so its misbehaving server is the other way about: a ninth
// server, a build of before the twelve, is not one more check switched off but the scaling switch off while it judges a deck (the mock
// below wraps the real validateUpload for a deck holding one of the seven new ids): that deck is then an unknown item, the answer of an
// older build (validate.ts validateBuild), the probe exits 1 with FAIL on exactly scale-signed, and the other fifteen rows still pass.
// BUMP-1F (RULING-BUMP1F-R13 R13.3; REQ-BFG-059, ENDLESS-1): the four ENDLESS rows of the kit probe of 0.9.13: the plan has twenty rows (endless-honest 201, endless-wins-cap 400 and
// endless-norecord 422 follow gates-signed) and runProbe sends a twenty-first check, the GET endless-match (200, an endless ghost; no deck): the correct server reads 21 of 21 with ten decks
// stored, and each single-case server below 20 of 21 with eleven stored (expected ten). A tenth server switches off endless-norecord's own check, records.ts endlessRecordProblem (the mock
// below wraps it): the same deck with 3 endless wins and 2 hearts is then taken. None of the eight switches before it lets an endless row through: the endless rows state their `losses`, hold an
// honest deck and are judged by endlessRecordProblem, not by the run record check those switches step aside from; and the older-build server (scale ids only) takes them. The strict decode
// that refuses endless-wins-cap (snapshot.ts) is inline code no mock can step aside from: that row's lenient pass is held by ghost-probe.test.ts' pass checks.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGhostServer, type GhostServer } from "../server/app";
import { JsonlStore } from "../server/store";
import { probeMain } from "../server/ghostProbe";

type Off = "signature" | "budget" | "record" | "metronome" | "siphon" | "lastchance-record" | "road" | "losses" | "endless-record"; // BUMP-1F (RULING-BUMP1F-R13 R13.3): + endless-record. Z-BUMP: + lastchance-record; AZ-BUMP: + road; BUMP-1D: + losses. BUMP-1E's ninth server ("older-build") is no `Off` case: it makes the server refuse the scale row, where each of these makes it take a forged row
/** The one check switched off for the next probe (null: none, the real server). */
const off = vi.hoisted(() => ({ check: null as null | string }));

// the signing check: with "signature" set, a POST needs no x-bb-key and x-bb-sig, and an unsigned body counts as signed
// by its own playerId; a signed body is still verified for real
vi.mock("../src/net/identity", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/net/identity")>();
  return {
    ...real,
    uploadHeaderError: (key: string | null | undefined, sig: string | null | undefined) =>
      (off.check === "signature" ? null : real.uploadHeaderError(key, sig)),
    verifyUpload: async (body: Uint8Array, key: string | null | undefined, sig: string | null | undefined) => {
      if (off.check === "signature" && !key && !sig) {
        return { ok: true as const, playerId: (JSON.parse(new TextDecoder().decode(body)) as { playerId: string }).playerId };
      }
      return real.verifyUpload(body, key, sig);
    },
  };
});
// the budget check: with "budget" set, validateUpload's budget errors are dropped; its other checks stand
vi.mock("../src/net/validate", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/net/validate")>();
  const scale = await import("../src/sim/scale"); // BUMP-1E: the scaling switch (the module instance the server reads)
  return {
    ...real,
    validateUpload: (...a: Parameters<typeof real.validateUpload>) => {
      // BUMP-1E (the bump): with "older-build" set, a deck holding one of the seven new ids is judged as a build of before the twelve
      // judges it: the same real check with the scaling switch off (synchronously; put back at once), where each new id is an unknown item
      const older = off.check === "older-build" && a[0].items.some((p) => scale.isScalePiece(p.def));
      const v = older ? scale.withScaleRigs(() => real.validateUpload(...a), false) : real.validateUpload(...a);
      // AZ-BUMP (the bump): with "road" set, its road lines are dropped the same way (npcday-forged's own check)
      const line = off.check === "budget" ? "budget: " : off.check === "road" ? "road: " : null;
      if (line === null) return v;
      const errors = v.errors.filter((e) => !e.startsWith(line));
      return { ...v, ok: errors.length === 0, errors };
    },
  };
});
// the record check (0.8.0 H2): with "record" set, every record counts as one a run carries into its dusk
// Z-BUMP (the flip): split by the upload's LAST CHANCE (server/app.ts passes its day, null for none), as the hero gate is
// split by hero, so each switch lets exactly one row through: "record" now steps aside only for an upload without one
// (every upload before the flip, when the decoder refused the field), and "lastchance-record" only for an upload with
// one (lastchance-day3's check). Unsplit, "record" let both unreachable-signed and lastchance-day3 through.
vi.mock("../src/net/records", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/net/records")>();
  return {
    ...real,
    isReachable: (...a: Parameters<typeof real.isReachable>) => {
      const lc = a[3]?.lastChance ?? null;
      return (off.check === "record" && lc === null) || (off.check === "lastchance-record" && lc !== null) || real.isReachable(...a);
    },
    // BUMP-1D (RUN-1; REQ-BFG-059, R1.2 T3c): the losses check (server/app.ts POST step 6, after the record check): with "losses"
    // set, an upload under a long run's rules that states no `losses` is taken; every other upload meets the real rule
    lossesProblem: (...a: Parameters<typeof real.lossesProblem>) => (off.check === "losses" ? null : real.lossesProblem(...a)),
    // BUMP-1F (RULING-BUMP1F-R13 R13.3; ENDLESS-1): the endless record check (server/app.ts POST step 6, for an upload with mode "endless"): with "endless-record" set, every endless record is taken;
    // an upload that is no endless meets the real rules (it never reaches this function)
    endlessRecordProblem: (...a: Parameters<typeof real.endlessRecordProblem>) => (off.check === "endless-record" ? null : real.endlessRecordProblem(...a)),
  };
});
// the hero gate (rulesGate.ts heroGateProblem, which the strict decoder and validateUpload both ask): with "metronome" or
// "siphon" set, that one hero passes it; every other hero meets the real gate
vi.mock("../src/net/rulesGate", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/net/rulesGate")>();
  return { ...real, heroGateProblem: (rules: unknown, hero: unknown) => (off.check !== null && hero === off.check ? null : real.heroGateProblem(rules, hero)) };
});

// Z-BUMP: the flip (was the nine rows, without lastchance-signed and lastchance-day3; ghost-probe.test.ts pins the same eleven)
const NAMES = ["furnace-signed", "furnace-unsigned", "dishonest-signed", "unreachable-signed", "hero-WEAVER", "hero-FOUNDRY", "hero-BASTION", "hero-METRONOME", "hero-SIPHON", "lastchance-signed", "lastchance-day3", "npcday-signed", "npcday-forged", "longrun-signed", "longrun-nolosses", "scale-signed", "gates-signed", "endless-honest", "endless-wins-cap", "endless-norecord"]; // BUMP-1F (RULING-BUMP1F-R13 R13.3: the kit probe's three endless POSTs, server/ghostProbe.ts endlessDusk, follow the 17th row): was seventeen, gates-signed last. BUMP-1F (the probe's 17th row, server/ghostProbe.ts gatesDusk; RULING-BUMP1F-R5 R5.2 (2)): was sixteen, scale-signed last. BUMP-1E: the bump (the scale row, last; was fifteen). BUMP-1D: the bump (the long run's two rows; was thirteen). AZ-BUMP: the bump (the NPC day's two rows; was eleven)
// BUMP-1F (RULING-BUMP1F-R13 R13.3): the check lines are the plan's twenty and the fourth endless check, the GET endless-match (runProbe sends it after the POSTs); the plan and the server's POST log hold NAMES and STATUSES
const CHECKS = [...NAMES, "endless-match"];
const STATUSES = ["201", "401", "422", "422", "201", "201", "201", "400", "400", "201", "422", "201", "422", "201", "422", "201", "201", "201", "400", "422"]; // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless rows' 201, 400 and 422; the match is a GET, no POST): was seventeen. BUMP-1F (the 17th row's 201; was sixteen). BUMP-1E: the bump (the scale row's 201; was fifteen). BUMP-1D: the bump (the long run's 201 and 422; was thirteen). AZ-BUMP: the bump (the NPC day's 201 and 422; was eleven). Z-BUMP: the flip (was nine, without the last 201 and 422)
/** Each misbehaving server: the check switched off, the probe row it lets through, and what that POST then gets. */
const CASES: { off: Off; row: string; status: string }[] = [
  { off: "signature", row: "furnace-unsigned", status: "200" },
  { off: "budget", row: "dishonest-signed", status: "201" },
  { off: "record", row: "unreachable-signed", status: "201" },
  { off: "metronome", row: "hero-METRONOME", status: "201" },
  { off: "siphon", row: "hero-SIPHON", status: "201" },
  { off: "lastchance-record", row: "lastchance-day3", status: "201" }, // Z-BUMP: the flip, the new row's own check
  { off: "road", row: "npcday-forged", status: "201" }, // AZ-BUMP: the bump, the NPC day's forged row's own check
  { off: "losses", row: "longrun-nolosses", status: "201" }, // BUMP-1D: the bump, the long run's forged row's own check (RUN-1's upload check)
  { off: "endless-record", row: "endless-norecord", status: "201" }, // BUMP-1F (RULING-BUMP1F-R13 R13.3): the endless record check, the forged endless row's own (3 endless wins and 2 hearts)
];

interface Rig {
  app: GhostServer;
  base: string;
  dir: string;
  idFile: string;
  log: string[];
}
let rig: Rig | null = null;

async function serve(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "bb-probe-bad-"));
  const store = new JsonlStore(join(dir, "data"));
  store.load();
  const log: string[] = [];
  const app = createGhostServer({ store, uploads: "open", log: (line) => log.push(line) });
  rig = { app, base: `http://127.0.0.1:${await app.listen(0)}`, dir, idFile: join(dir, "probe-id.txt"), log };
  return rig;
}

afterEach(async () => {
  off.check = null;
  if (!rig) return;
  await rig.app.close();
  rmSync(rig.dir, { recursive: true, force: true });
  rig = null;
});

/** The status of each POST /v1/ghosts in the server's request log, in order. */
const posts = (log: string[]) => log.filter((l) => / POST \/v1\/ghosts /.test(l)).map((l) => l.split(" ")[3]);
const checkLines = (lines: string[]) => lines.filter((l) => /^(PASS|FAIL) {2}/.test(l));

describe("the uploads step's probe against a misbehaving server (one check switched off)", () => {
  it("no check switched off: the same rig is the correct server, twenty-one checks as expected, exit 0, ten decks stored", async () => { // BUMP-1F (RULING-BUMP1F-R13 R13.3: the three endless POSTs and the GET endless-match): was seventeen checks, nine decks. BUMP-1F (the 17th row): was sixteen checks, eight decks. BUMP-1E: the bump (was fifteen checks, seven decks). BUMP-1D: the bump (was thirteen checks, six decks). AZ-BUMP: the bump (was eleven checks, five decks). Z-BUMP: the flip (was nine checks, four decks)
    const { base, idFile, log } = await serve();
    const lines: string[] = [];
    expect(await probeMain([base, idFile], (l) => lines.push(l))).toBe(0);
    expect(checkLines(lines).map((l) => l.split(/\s+/).slice(0, 2).join(" "))).toEqual(CHECKS.map((n) => `PASS ${n}`)); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was NAMES: the endless match is the twenty-first check
    expect(posts(log)).toEqual(STATUSES);
    expect(lines.at(-1)).toBe(`probe: 21 of 21 checks as expected; the server stored 10 deck(s) for this player (expected 10); the player id is in ${idFile}`); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 17 of 17, stored 9, expected 9. BUMP-1F (the 17th row): was 16 of 16, stored 8, expected 8. BUMP-1E: the bump (was 15 of 15, stored 7, expected 7). BUMP-1D: the bump (was 13 of 13, stored 6, expected 6). AZ-BUMP: the bump (was 11 of 11, stored 5, expected 5). Z-BUMP: the flip (was 9 of 9, stored 4, expected 4)
  }, 60_000);

  it.each(CASES)("a server that takes the $row row (its $off check switched off): the probe exits 1 with FAIL on exactly that row", async ({ off: which, row, status }) => {
    const { base, idFile, log } = await serve();
    off.check = which;
    const lines: string[] = [];
    expect(await probeMain([base, idFile], (l) => lines.push(l))).toBe(1);
    const checks = checkLines(lines);
    expect(checks.map((l) => l.split(/\s+/)[1])).toEqual(CHECKS); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was NAMES
    expect(checks.filter((l) => l.startsWith("FAIL")).map((l) => l.split(/\s+/)[1])).toEqual([row]);
    // the server misbehaved as meant, and only there: that row's POST was taken, every other answered as the real server's
    expect(posts(log)).toEqual(STATUSES.map((s, i) => (NAMES[i] === row ? status : s)));
    expect(checks[NAMES.indexOf(row)]).toMatch(new RegExp(`^FAIL {2}${row} +expected: \\d{3} .+ \\| got: ${status} \\{"id":"g[0-9a-f]{14}"\\}$`));
    expect(lines.at(-1)).toBe(`probe: 20 of 21 checks as expected; the server stored 11 deck(s) for this player (expected 10); the player id is in ${idFile}`); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 16 of 17, stored 10, expected 9. BUMP-1F (the 17th row): was 15 of 16, stored 9, expected 8. BUMP-1E: the bump (was 14 of 15, stored 8, expected 7). BUMP-1D: the bump (was 12 of 13, stored 7, expected 6). AZ-BUMP: the bump (was 10 of 11, stored 6, expected 5). Z-BUMP: the flip (was 8 of 9, stored 5, expected 4)
  }, 60_000);

  // BUMP-1E (the bump): the scale row from the other side. A server of an older build does not know the seven new ids, so it refuses the
  // scale row as an unknown item (422) where the real server takes it (201), and the probe says so: exit 1, FAIL on exactly that row, the
  // other fifteen as expected and seven decks stored (not eight). The server is the real in-process app; the mock above steps in only
  // for a deck holding one of the new ids (the real check, with the scaling switch off while it judges that deck)
  it("a server of an older build (it does not know the new ids): the probe exits 1 with FAIL on exactly the scale-signed row, which gets the unknown-item 422", async () => {
    const { base, idFile, log } = await serve();
    off.check = "older-build";
    const lines: string[] = [];
    expect(await probeMain([base, idFile], (l) => lines.push(l))).toBe(1);
    const checks = checkLines(lines);
    expect(checks.map((l) => l.split(/\s+/)[1])).toEqual(CHECKS); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was NAMES
    expect(checks.filter((l) => l.startsWith("FAIL")).map((l) => l.split(/\s+/)[1])).toEqual(["scale-signed"]);
    // the server answered as meant, and only there: the scale row's POST was refused, every other answered as the real server's
    expect(posts(log)).toEqual(STATUSES.map((s, i) => (NAMES[i] === "scale-signed" ? "422" : s)));
    expect(checks[NAMES.indexOf("scale-signed")]).toMatch(/^FAIL {2}scale-signed {7}expected: 201 \{"id":"g[0-9a-f]{14}"\} \| got: 422 deck failed validation: item: uid \d+ is unknown item "grudgerod"$/);
    expect(lines.at(-1)).toBe(`probe: 20 of 21 checks as expected; the server stored 9 deck(s) for this player (expected 10); the player id is in ${idFile}`); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 16 of 17, stored 8, expected 9. BUMP-1F (the 17th row): was 15 of 16, stored 7, expected 8
  }, 60_000);
});
