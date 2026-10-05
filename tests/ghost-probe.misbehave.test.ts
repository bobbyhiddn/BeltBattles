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
// the same rig passes all nine (exit 0), as the correct server does.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGhostServer, type GhostServer } from "../server/app";
import { JsonlStore } from "../server/store";
import { probeMain } from "../server/ghostProbe";

type Off = "signature" | "budget" | "record" | "metronome" | "siphon";
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
      if (off.check !== "budget") return v;
      const errors = v.errors.filter((e) => !e.startsWith("budget: "));
      return { ...v, ok: errors.length === 0, errors };
    },
  };
});
// the record check (0.8.0 H2): with "record" set, every record counts as one a run carries into its dusk
vi.mock("../src/net/records", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/net/records")>();
  return { ...real, isReachable: (...a: Parameters<typeof real.isReachable>) => off.check === "record" || real.isReachable(...a) };
});
// the hero gate (rulesGate.ts heroGateProblem, which the strict decoder and validateUpload both ask): with "metronome" or
// "siphon" set, that one hero passes it; every other hero meets the real gate
vi.mock("../src/net/rulesGate", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/net/rulesGate")>();
  return { ...real, heroGateProblem: (rules: unknown, hero: unknown) => (off.check !== null && hero === off.check ? null : real.heroGateProblem(rules, hero)) };
});

const NAMES = ["furnace-signed", "furnace-unsigned", "dishonest-signed", "unreachable-signed", "hero-WEAVER", "hero-FOUNDRY", "hero-BASTION", "hero-METRONOME", "hero-SIPHON"];
const STATUSES = ["201", "401", "422", "422", "201", "201", "201", "400", "400"];
/** Each misbehaving server: the check switched off, the probe row it lets through, and what that POST then gets. */
const CASES: { off: Off; row: string; status: string }[] = [
  { off: "signature", row: "furnace-unsigned", status: "200" },
  { off: "budget", row: "dishonest-signed", status: "201" },
  { off: "record", row: "unreachable-signed", status: "201" },
  { off: "metronome", row: "hero-METRONOME", status: "201" },
  { off: "siphon", row: "hero-SIPHON", status: "201" },
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
  it("no check switched off: the same rig is the correct server, nine checks as expected, exit 0, four decks stored", async () => {
    const { base, idFile, log } = await serve();
    const lines: string[] = [];
    expect(await probeMain([base, idFile], (l) => lines.push(l))).toBe(0);
    expect(checkLines(lines).map((l) => l.split(/\s+/).slice(0, 2).join(" "))).toEqual(NAMES.map((n) => `PASS ${n}`));
    expect(posts(log)).toEqual(STATUSES);
    expect(lines.at(-1)).toBe(`probe: 9 of 9 checks as expected; the server stored 4 deck(s) for this player (expected 4); the player id is in ${idFile}`);
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
    expect(lines.at(-1)).toBe(`probe: 8 of 9 checks as expected; the server stored 5 deck(s) for this player (expected 4); the player id is in ${idFile}`);
  }, 60_000);
});
