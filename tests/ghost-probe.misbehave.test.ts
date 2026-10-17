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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGhostServer, type GhostServer } from "../server/app";
import { JsonlStore } from "../server/store";
import { probeMain } from "../server/ghostProbe";

type Off = "signature" | "budget" | "record" | "metronome" | "siphon" | "lastchance-record" | "road" | "losses"; // Z-BUMP: + lastchance-record; AZ-BUMP: + road; BUMP-1D: + losses
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
  return {
    ...real,
    validateUpload: (...a: Parameters<typeof real.validateUpload>) => {
      const v = real.validateUpload(...a);
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
  };
});
// the hero gate (rulesGate.ts heroGateProblem, which the strict decoder and validateUpload both ask): with "metronome" or
// "siphon" set, that one hero passes it; every other hero meets the real gate
vi.mock("../src/net/rulesGate", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/net/rulesGate")>();
  return { ...real, heroGateProblem: (rules: unknown, hero: unknown) => (off.check !== null && hero === off.check ? null : real.heroGateProblem(rules, hero)) };
});

// Z-BUMP: the flip (was the nine rows, without lastchance-signed and lastchance-day3; ghost-probe.test.ts pins the same eleven)
const NAMES = ["furnace-signed", "furnace-unsigned", "dishonest-signed", "unreachable-signed", "hero-WEAVER", "hero-FOUNDRY", "hero-BASTION", "hero-METRONOME", "hero-SIPHON", "lastchance-signed", "lastchance-day3", "npcday-signed", "npcday-forged", "longrun-signed", "longrun-nolosses"]; // BUMP-1D: the bump (the long run's two rows; was thirteen). AZ-BUMP: the bump (the NPC day's two rows; was eleven)
const STATUSES = ["201", "401", "422", "422", "201", "201", "201", "400", "400", "201", "422", "201", "422", "201", "422"]; // BUMP-1D: the bump (the long run's 201 and 422; was thirteen). AZ-BUMP: the bump (the NPC day's 201 and 422; was eleven). Z-BUMP: the flip (was nine, without the last 201 and 422)
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
  it("no check switched off: the same rig is the correct server, fifteen checks as expected, exit 0, seven decks stored", async () => { // BUMP-1D: the bump (was thirteen checks, six decks). AZ-BUMP: the bump (was eleven checks, five decks). Z-BUMP: the flip (was nine checks, four decks)
    const { base, idFile, log } = await serve();
    const lines: string[] = [];
    expect(await probeMain([base, idFile], (l) => lines.push(l))).toBe(0);
    expect(checkLines(lines).map((l) => l.split(/\s+/).slice(0, 2).join(" "))).toEqual(NAMES.map((n) => `PASS ${n}`));
    expect(posts(log)).toEqual(STATUSES);
    expect(lines.at(-1)).toBe(`probe: 15 of 15 checks as expected; the server stored 7 deck(s) for this player (expected 7); the player id is in ${idFile}`); // BUMP-1D: the bump (was 13 of 13, stored 6, expected 6). AZ-BUMP: the bump (was 11 of 11, stored 5, expected 5). Z-BUMP: the flip (was 9 of 9, stored 4, expected 4)
  }, 60_000);

  it.each(CASES)("a server that takes the $row row (its $off check switched off): the probe exits 1 with FAIL on exactly that row", async ({ off: which, row, status }) => {
    const { base, idFile, log } = await serve();
    off.check = which;
    const lines: string[] = [];
    expect(await probeMain([base, idFile], (l) => lines.push(l))).toBe(1);
    const checks = checkLines(lines);
    expect(checks.map((l) => l.split(/\s+/)[1])).toEqual(NAMES);
    expect(checks.filter((l) => l.startsWith("FAIL")).map((l) => l.split(/\s+/)[1])).toEqual([row]);
    // the server misbehaved as meant, and only there: that row's POST was taken, every other answered as the real server's
    expect(posts(log)).toEqual(STATUSES.map((s, i) => (NAMES[i] === row ? status : s)));
    expect(checks[NAMES.indexOf(row)]).toMatch(new RegExp(`^FAIL {2}${row} +expected: \\d{3} .+ \\| got: ${status} \\{"id":"g[0-9a-f]{14}"\\}$`));
    expect(lines.at(-1)).toBe(`probe: 14 of 15 checks as expected; the server stored 8 deck(s) for this player (expected 7); the player id is in ${idFile}`); // BUMP-1D: the bump (was 12 of 13, stored 7, expected 6). AZ-BUMP: the bump (was 10 of 11, stored 6, expected 5). Z-BUMP: the flip (was 8 of 9, stored 5, expected 4)
  }, 60_000);
});
