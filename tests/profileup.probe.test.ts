// PROFILE-UP step 6 / P9 (REQ-BFG-074 clause 4, backlog #371): the opt-in `--profile` rows of the uploads probe
// (server/ghostProbe.ts). A fresh probe identity PUTs a minimal profile and expects 200 and the same bytes back; the same
// body with a broken signature expects 401. Without the flag nothing changes: the sixteen POST rows, the same lines, no PUT.
// With it: eighteen checks pass against the in-process server on both stores, the decks stored are still counted as eight, and
// the profile lands under the probe's player id. Closed uploads and an older server (no route) fail the two rows by name.
// BUMP-1D (the bump to bb-0.11.0; RUN-1): the probe's POST rows are fifteen (the long run's longrun-signed and longrun-nolosses
// follow the thirteen of AZ-BUMP's probe) and its decks seven (FURNACE's day-12 deck), so these counts moved by two and one.
// BUMP-1E (the bump to bb-0.12.0; REQ-BFG-098): the probe's POST rows are sixteen (scale-signed, FURNACE's day-1 deck plus one GRUDGE ROD,
// follows longrun-nolosses) and its decks eight, so these counts moved by one each: with --profile 18 of 18 (the sixteen and the two PUTs).
// BUMP-1F (REQ-BFG-052, REQ-BFG-085; RULING-BUMP1F-R5 R5.2 (2)): the probe's POST rows are seventeen (gates-signed, FURNACE's day-3 deck plus a FUSER and a WHETSTONE
// holding one word, follows scale-signed) and its decks nine, so these counts moved by one each again: with --profile 19 of 19 (the seventeen and the two PUTs).
// BUMP-1F (RULING-BUMP1F-R13 R13.3; REQ-BFG-059, ENDLESS-1): the four ENDLESS rows of the kit probe of 0.9.13: the probe's POST rows are twenty (endless-honest, endless-wins-cap, endless-norecord follow
// gates-signed) and runProbe sends a twenty-first check after them, the GET endless-match, before the profile rows; its decks ten (FURNACE's endless day-14 deck; the match is no deck). So the
// check counts moved by four (21 without the flag, 23 with it: the twenty POSTs, the match and the two PUTs) and the deck counts by one.
import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { BADSIG_ERROR, PROFILE_FLAG, PROBE_USAGE, probeMain, probePlan, profilePlan, profileProbeText, runProbe } from "../server/ghostProbe";
import { createGhostServer, type GhostServer, type ServerOptions } from "../server/app";
import { MemoryProfileStore } from "../server/profileStore";
import type { JsonlStore } from "../server/store";
import { checkWire, decodeWire, encodeWire } from "../src/net/profileWire";
import type { FakeS3 } from "../tools/fakeS3";
import { jsonlBackend, startFake, tigrisFor, type StoreBackend } from "./netStores";

const NOW = 1_790_000_000_000;
const backend: StoreBackend = jsonlBackend();
const cleanup: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const c of cleanup) await c();
  await backend.teardown();
});

interface Rig {
  app: GhostServer;
  base: string;
  log: string[];
  idFile: string;
  profiles: MemoryProfileStore;
}

let n = 0;
async function serve(over: Omit<ServerOptions, "store" | "dataDir"> = {}): Promise<Rig> {
  if (n++ === 0) await backend.setup();
  const log: string[] = [];
  const profiles = new MemoryProfileStore();
  const app = backend.server({ log: (l) => log.push(l), profileStore: profiles, ...over }, true);
  const base = `http://127.0.0.1:${await app.listen(0)}`;
  cleanup.push(() => app.close());
  return { app, base, log, idFile: join((app.store as JsonlStore).dataDir, "probe-id.txt"), profiles };
}

const names = (lines: string[]): string[] => lines.filter((l) => /^(PASS|FAIL) /.test(l)).map((l) => l.split(/\s+/)[1]);

describe("--profile is opt-in: without it nothing changes", () => {
  it("the plan is the twenty POSTs, the checks those and the endless match; the profile rows are a plan of their own; no PUT is sent", async () => { // BUMP-1F (RULING-BUMP1F-R13 R13.3: the three endless POSTs and the GET endless-match): was the seventeen. BUMP-1F (the 17th row): was the sixteen. BUMP-1E: the bump (was the fifteen). BUMP-1D: the bump (was the thirteen)
    const r = await serve();
    expect(probePlan("p", NOW)).toHaveLength(20); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless POSTs): was 17. BUMP-1F (the 17th row, gates-signed): was 16. BUMP-1E: was 15. BUMP-1D: was 13
    expect(profilePlan(NOW).map((p) => p.name)).toEqual(["profile-signed", "profile-badsig"]);
    const lines: string[] = [];
    expect(await probeMain([r.base, r.idFile], (l) => lines.push(l))).toBe(0);
    expect(names(lines)).toHaveLength(21); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the twenty POSTs and the endless match): was 17. BUMP-1F (the 17th row): was 16. BUMP-1E: was 15. BUMP-1D: was 13
    expect(names(lines).at(-1)).toBe("endless-match"); // BUMP-1F (RULING-BUMP1F-R13 R13.3): the GET comes last without the flag
    expect(names(lines)).not.toContain("profile-signed");
    expect(lines.filter((l) => l.startsWith("probe: --profile"))).toEqual([]);
    expect(lines[lines.length - 1]).toMatch(/^probe: 21 of 21 checks as expected; the server stored 10 deck\(s\) for this player \(expected 10\); the player id is in /); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 17 of 17, 9, 9. BUMP-1F (the 17th row): was 16 of 16, 8, 8. BUMP-1E: was 15 of 15, 7, 7. BUMP-1D: was 13 of 13, 6, 6
    expect(r.log.some((l) => l.includes("/v1/profile"))).toBe(false);
    expect(r.profiles.records.size).toBe(0);
  });

  it("runProbe without the option makes the same twenty-one checks and no profile request", async () => { // BUMP-1F (RULING-BUMP1F-R13 R13.3: the three endless POSTs and the endless match): was the same seventeen. BUMP-1F (the 17th row): was the same sixteen. BUMP-1E: the bump (was the same fifteen). BUMP-1D: the bump (was the same thirteen)
    const r = await serve();
    const res = await runProbe(r.base, () => {}, 15_000, NOW);
    expect(res.checks).toHaveLength(21); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 17. BUMP-1F (the 17th row): was 16. BUMP-1E: was 15. BUMP-1D: was 13
    expect(res.ok).toBe(true);
    expect(res.stored).toBe(10); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless deck; the match's 200 is no deck): was 9. BUMP-1F (the 17th row's deck): was 8. BUMP-1E: was 7. BUMP-1D: was 6
    expect(r.log.some((l) => l.includes("/v1/profile"))).toBe(false);
  });
});

describe("--profile: the two rows", () => {
  it("the body is written out in the probe and equals the canonical form of the minimal profile, which the server's caps accept", () => {
    const text = profileProbeText(NOW);
    const w = decodeWire(text); // the strict decode takes it: so it is exactly the canonical text
    expect(encodeWire(w)).toBe(text);
    expect(() => checkWire(w, NOW)).not.toThrow();
    expect(w.counters).toMatchObject({ runs: 1, duskWins: 1, bestDay: 2 });
    expect(w.unlocked).toEqual([]);
    expect(w.heroesWon).toEqual(["furnace"]);
    expect(w.updatedAt).toBe(NOW);
  });

  it("every check passes on the JSON-lines store: 23 of 23, ten decks, one profile under the probe's player id, the flag anywhere", async () => { // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless rows): was 19 of 19, nine decks. BUMP-1F (the 17th row): was 18 of 18, eight decks. BUMP-1E: the bump (was 17 of 17, seven decks). BUMP-1D: the bump (was 15 of 15, six decks)
    for (const argv of [(r: Rig) => [r.base, r.idFile, PROFILE_FLAG], (r: Rig) => [PROFILE_FLAG, r.base, r.idFile], (r: Rig) => [r.base, PROFILE_FLAG, r.idFile]]) {
      const r = await serve();
      const lines: string[] = [];
      expect(await probeMain(argv(r), (l) => lines.push(l))).toBe(0);
      expect(names(lines)).toHaveLength(23); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the three endless POSTs, the endless match and the two PUTs): was 19. BUMP-1F (the 17th row): was 18. BUMP-1E: was 17. BUMP-1D: was 15
      expect(names(lines).slice(-3)).toEqual(["endless-match", "profile-signed", "profile-badsig"]); // BUMP-1F (RULING-BUMP1F-R13 R13.3): the GET follows the POSTs and comes before the PUTs (was .slice(-2) without it)
      expect(lines.filter((l) => l.startsWith("FAIL"))).toEqual([]);
      expect(lines.some((l) => l.startsWith(`probe: ${PROFILE_FLAG}: then PUT ${r.base}/v1/profile`))).toBe(true);
      expect(lines[lines.length - 1]).toMatch(/^probe: 23 of 23 checks as expected; the server stored 10 deck\(s\) for this player \(expected 10\); the player id is in /); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 19 of 19, 9, 9. BUMP-1F (the 17th row): was 18 of 18, 8, 8. BUMP-1E: was 17 of 17, 7, 7. BUMP-1D: was 15 of 15, 6, 6
      const playerId = readFileSync(r.idFile, "utf8").trim();
      expect([...r.profiles.records.keys()]).toEqual([playerId]); // one record, the probe player's
      const rec = JSON.parse(r.profiles.records.get(playerId)!) as { receivedAt: number; profile: unknown };
      expect(Object.keys(rec)).toEqual(["receivedAt", "profile"]);
      expect(encodeWire(rec.profile as Parameters<typeof encodeWire>[0])).toMatch(/^\{"v":1,"counters":\{"runs":1,/);
      const puts = r.log.filter((l) => l.includes(" PUT /v1/profile "));
      expect(puts.map((l) => l.split(" ")[3])).toEqual(["200", "401"]);
      expect(puts.join("\n")).not.toContain(playerId);
      expect(r.app.store.size).toBe(10); // the decks, not the profile (BUMP-1F, R13.3: was 9; BUMP-1F, the 17th row: was 8; BUMP-1E: was 7; BUMP-1D: was 6)
    }
  });

  it("the 200 row passes only on the same bytes back; the 401 row only on the signature error", () => {
    const [signed, broken] = profilePlan(NOW);
    const text = profileProbeText(NOW);
    expect(signed.pass({ status: 200, text })).toBe(true);
    expect(signed.pass({ status: 200, text: text.replace('"runs":1', '"runs":2') })).toBe(false); // an echo that is not the upload
    expect(signed.pass({ status: 201, text })).toBe(false);
    expect(signed.pass({ status: 403, text: '{"error":"uploads are not open yet"}', error: "uploads are not open yet" })).toBe(false);
    expect(broken.pass({ status: 401, text: "", error: BADSIG_ERROR })).toBe(true);
    expect(broken.pass({ status: 401, text: "", error: "unsigned upload: the x-bb-key and x-bb-sig headers are required" })).toBe(false);
    expect(broken.pass({ status: 200, text })).toBe(false);
    expect(broken.pass({ status: 404, text: "", error: "not found" })).toBe(false);
  });

  it("on Tigris over the fake S3: 23 of 23, the ten decks under ghosts/, the profile at profiles/<player id>.json", async () => { // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless rows): was 19 of 19, the nine decks. BUMP-1F (the 17th row): was 18 of 18, the eight decks. BUMP-1E: the bump (was 17 of 17, the seven decks). BUMP-1D: the bump (was 15 of 15, the six decks)
    const fake: FakeS3 = await startFake();
    cleanup.push(() => fake.close());
    const app = createGhostServer({ store: tigrisFor(fake), log: () => {} });
    cleanup.push(() => app.close());
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    const res = await runProbe(base, () => {}, 15_000, Date.now(), { profile: true });
    expect(res.checks.map((c) => c.name).slice(-3)).toEqual(["endless-match", "profile-signed", "profile-badsig"]); // BUMP-1F (RULING-BUMP1F-R13 R13.3): the endless match precedes the PUTs (was .slice(-2))
    expect(res.checks.filter((c) => !c.ok)).toEqual([]);
    expect(res.checks).toHaveLength(23); // BUMP-1F (RULING-BUMP1F-R13 R13.3): was 19. BUMP-1F (the 17th row): was 18. BUMP-1E: was 17. BUMP-1D: was 15
    expect(res.stored).toBe(10); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless deck): was 9. BUMP-1F (the 17th row's deck): was 8. BUMP-1E: was 7. BUMP-1D: was 6
    expect(fake.keys("bb-test", "ghosts/")).toHaveLength(10); // BUMP-1F (RULING-BUMP1F-R13 R13.3: the endless deck, under d14): was 9. BUMP-1F (the 17th row's deck): was 8. BUMP-1E: was 7. BUMP-1D: was 6
    expect(fake.keys("bb-test", "profiles/")).toEqual([`profiles/${res.playerId}.json`]);
  });

  it("uploads closed: both rows fail, by name (403 for each), the exit is 1 and nothing is stored", async () => {
    const r = await serve({ uploads: "closed" });
    const lines: string[] = [];
    expect(await probeMain([r.base, r.idFile, PROFILE_FLAG], (l) => lines.push(l))).toBe(1);
    const fails = lines.filter((l) => l.startsWith("FAIL"));
    expect(fails).toHaveLength(23); // the 20 POST rows too: closed uploads answer every one of them 403, and the endless match (a GET, not an upload) gets the empty store's 404 (BUMP-1F, R13.3: was 19 and the 17; BUMP-1F, the 17th row: was 18 and the 16; BUMP-1E: was 17 and the 15; BUMP-1D: was 15 and the 13)
    expect(fails.filter((l) => l.includes("profile-"))).toHaveLength(2);
    for (const l of fails.filter((l) => l.includes("profile-"))) expect(l).toContain("403 uploads are not open yet");
    expect(r.profiles.records.size).toBe(0);
  });

  it("an older server without the route: both rows fail with its 404, and the rest of the probe is untouched", async () => {
    const old: Server = createServer((req, res) => {
      req.on("data", () => {});
      req.on("end", () => {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end('{"error":"not found"}');
      });
    });
    await new Promise<void>((r) => old.listen(0, "127.0.0.1", () => r()));
    cleanup.push(() => new Promise<void>((r) => { old.closeAllConnections(); old.close(() => r()); }));
    const a = old.address();
    const base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
    const res = await runProbe(base, () => {}, 5000, NOW, { profile: true });
    const rows = res.checks.filter((c) => c.name.startsWith("profile-"));
    expect(rows.map((c) => [c.name, c.ok, c.got])).toEqual([
      ["profile-signed", false, '404 not found'],
      ["profile-badsig", false, '404 not found'],
    ]);
    expect(res.stored).toBe(0);
  });

  it("a dead port: the profile rows say no answer, like every other row", async () => {
    const dead = await serve();
    await dead.app.close();
    const res = await runProbe(dead.base, () => {}, 1000, NOW, { profile: true });
    expect(res.checks.filter((c) => c.name.startsWith("profile-")).map((c) => c.got.startsWith("no answer"))).toEqual([true, true]);
    expect(res.ok).toBe(false);
  });

  it("usage errors are as they were: the flag does not count as an argument, and nothing is sent", async () => {
    const r = await serve();
    for (const [argv, said] of [
      [[PROFILE_FLAG], "expected 2 arguments, got 0"],
      [[r.base, PROFILE_FLAG], "expected 2 arguments, got 1"],
      [[r.base, r.idFile, "extra", PROFILE_FLAG], "expected 2 arguments, got 3"],
      [[r.base, r.idFile, "--other"], "expected 2 arguments, got 3"],
    ] as const) {
      const lines: string[] = [];
      expect(await probeMain(argv, (l) => lines.push(l)), JSON.stringify(argv)).toBe(2);
      expect(lines).toEqual([`ghost-probe: ${said}`, PROBE_USAGE]);
    }
    expect(r.log.filter((l) => l.includes("/v1/"))).toEqual([]);
    expect(existsSync(r.idFile)).toBe(false);
  });
});
